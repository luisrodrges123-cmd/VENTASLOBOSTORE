const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push, update } = require('firebase/database');

// 🐺 CONFIGURACIÓN FIREBASE
const firebaseConfig = { databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com" };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 🐺 CONFIGURACIÓN BOT MODO PREMIUM (Logo Oficial Estable)
const LOGO_PREMIUM = 'https://i.postimg.cc/JyW9Jt8R/logo-lobo.png';
const ADMIN_NUMBER = '5216682515249@s.whatsapp.net';

const sessions = {};

// Funciones de utilidad
const getRealNumber = (jid) => jidNormalizedUser(jid).split('@')[0];

const extractPhoneNumber = (text) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 10) return cleaned;
    return null;
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store Premium', 'Chrome', '1.0.0']
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
            console.log('✅ SISTEMA LOBO STORE PREMIUM ACTIVO 🐺💎');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const userNumber = getRealNumber(from);
        const pushName = msg.pushName || 'Cliente';
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const mensaje = text.toLowerCase();

        // --- REGISTRO AUTOMÁTICO ---
        try {
            update(ref(db, 'bot_users/' + userNumber), {
                pushName: pushName,
                number: userNumber,
                lastSeen: Date.now()
            });
        } catch (e) {}

        // --- DETECCIÓN INTELIGENTE DE DATOS ---
        if (sessions[from] === 'waiting_contact_info') {
            const detectedNumber = extractPhoneNumber(text);

            if (!detectedNumber) {
                await sock.sendMessage(from, { text: `❌ No he podido reconocer un número de teléfono válido. Por favor, envía tu número a 10 dígitos (ej: 6681234567).` });
                return;
            }

            delete sessions[from];
            await sock.sendMessage(from, { text: `✅ ¡Perfecto! He detectado el número: *${detectedNumber}*. El Administrador de *LOBO STORE* te contactará de inmediato. 🐺` });

            // Aviso al Admin con el número DETECTADO
            await sock.sendMessage(ADMIN_NUMBER, {
                text: `🐺 *NUEVA SOLICITUD DE ASESORÍA*\n\n*Usuario:* ${pushName}\n*Número proporcionado:* ${detectedNumber}\n*WhatsApp de origen:* wa.me/${userNumber}\n\n*Mensaje completo:* \n${text}`
            });

            try {
                const newRef = push(ref(db, 'talk_requests'));
                await update(newRef, {
                    name: pushName,
                    numero_detectado: detectedNumber,
                    mensaje_original: text,
                    number: userNumber,
                    timestamp: Date.now()
                });
            } catch (e) {}
            return;
        }

        // --- FUNCIÓN PARA ENVIAR IMAGEN PREMIUM ---
        const sendPremiumImage = async (jid, caption) => {
            try {
                await sock.sendMessage(jid, { image: { url: LOGO_PREMIUM }, caption });
            } catch (err) {
                await sock.sendMessage(jid, { text: caption });
            }
        };

        // --- COMANDOS ---
        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            await sendPremiumImage(from, `👋 ¡Hola ${pushName}! 🐺\n\nHe recibido tu pedido con éxito. Un asesor lo revisará en este momento.\n\n✅ *Registrado en sistema Modo Premium.*`);
            return;
        }

        if (mensaje === 'hola' || mensaje === 'menu' || mensaje === 'lobo' || mensaje === 'menú') {
            await sendPremiumImage(from, `🐺 *CENTRAL DE VENTAS LOBO STORE* 🐺\n\nHola *${pushName}*, bienvenido a nuestra atención de lujo. ¿En qué podemos ayudarte?\n\n1️⃣ *Ver Catálogo Premium* 📦\n2️⃣ *Promociones del Mes* 🔥\n3️⃣ *Horarios y Entregas* 🕒\n4️⃣ *Hablar con Administrador* 👨‍💼\n\n🌐 *Tienda Online:* \nhttps://producto-enventa-63d4e.firebaseapp.com/`);
            return;
        }

        if (mensaje === '4') {
            sessions[from] = 'waiting_contact_info';
            await sock.sendMessage(from, { text: `👨‍💼 *CONTACTO PERSONALIZADO*\n\nPor favor, escribe tu *Nombre Completo* y tu *Número de Teléfono* para que el administrador te contacte directamente.` });
            return;
        }

        if (mensaje === '1') {
            await sock.sendMessage(from, { text: `🚀 Explora nuestro inventario en tiempo real aquí:\nhttps://producto-enventa-63d4e.firebaseapp.com/` });
        }
    });
}

connectToWhatsApp().catch(err => console.log("Error: " + err));
