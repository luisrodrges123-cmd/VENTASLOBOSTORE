const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const admin = require('firebase-admin');

// 🐺 INICIALIZACIÓN FIREBASE (ADMIN)
if (!admin.apps.length) {
    admin.initializeApp({
        databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com"
    });
}
const db = admin.database();

// 🐺 CONFIGURACIÓN
const LOGO_LOBO = 'https://i.postimg.cc/JyW9Jt8R/logo-lobo.png';
const ADMIN_NUMBER = '5216682515249@s.whatsapp.net'; // Tu número para avisos

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store Control', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ?
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ BOT LOBO STORE ACTIVO Y CONECTADO 🐺');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const pushName = msg.pushName || 'Usuario';
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const mensaje = text.toLowerCase().trim();

        // --- REGISTRO AUTOMÁTICO DE USUARIO EN FIREBASE ---
        const userRef = db.ref('bot_users').child(from.replace('@s.whatsapp.net', ''));
        await userRef.update({
            pushName: pushName,
            number: from.split('@')[0],
            lastInteraction: Date.now()
        });

        // --- RESPUESTA A PEDIDO WEB ---
        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            await sock.sendMessage(from, {
                image: { url: LOGO_LOBO },
                caption: `👋 ¡Hola ${pushName}! 🐺\n\nHe recibido tu pedido. Un asesor lo revisará de inmediato.\n\n✅ *Registrado en sistema.*`
            });
            return;
        }

        // --- MENÚ PRINCIPAL ---
        if (mensaje === 'hola' || mensaje === 'menu' || mensaje === 'lobo') {
            await sock.sendMessage(from, {
                image: { url: LOGO_LOBO },
                caption: `🐺 *VENTAS LOBO STORE* 🐺\n\nHola *${pushName}*, elige una opción:\n\n1️⃣ Catálogo 📦\n2️⃣ Promos 🔥\n3️⃣ Horarios 🕒\n4️⃣ Hablar con asesor 👨‍💼\n\n🌐 https://producto-enventa-63d4e.firebaseapp.com/`
            });
        }

        // --- OPCIÓN 4: HABLAR CON ASESOR (AVISO AL ADMIN) ---
        if (mensaje === '4') {
            // 1. Avisar al usuario
            await sock.sendMessage(from, { text: `👨‍💼 Entendido. He avisado a mi jefe para que te atienda personalmente. Espera un momento...` });

            // 2. Avisar al ADMIN (+52 1 668 251 5249)
            await sock.sendMessage(ADMIN_NUMBER, {
                text: `🐺 *AVISO DE ASESORÍA*\n\nEl usuario *${pushName}* (${from.split('@')[0]}) quiere hablar contigo ahora mismo.`
            });

            // 3. Registrar en Panel Admin
            await db.ref('talk_requests').push({
                name: pushName,
                number: from.split('@')[0],
                timestamp: Date.now()
            });
        }

        if (mensaje === '1') {
            await sock.sendMessage(from, { text: `🚀 Mira todo lo que tenemos aquí:\nhttps://producto-enventa-63d4e.firebaseapp.com/` });
        }
    });
}

connectToWhatsApp().catch(err => console.log("Error: " + err));
