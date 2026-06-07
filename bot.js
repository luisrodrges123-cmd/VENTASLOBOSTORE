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

// 🐺 CONFIGURACIÓN BOT MODO PREMIUM (Logo Estable)
const LOGO_PREMIUM = 'https://i.postimg.cc/JyW9Jt8R/logo-lobo.png';
const ADMIN_NUMBER = '5216682515249@s.whatsapp.net';

const sessions = {};

const getRealNumber = (jid) => {
    if (!jid) return 'Desconocido';
    return jidNormalizedUser(jid).split('@')[0];
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

        // --- REGISTRO DE USUARIO ---
        try {
            update(ref(db, 'bot_users/' + userNumber), {
                pushName: pushName,
                number: userNumber,
                lastSeen: Date.now(),
                status: "Activo"
            });
        } catch (e) {}

        // --- FLUJO ASESORÍA ---
        if (sessions[from] === 'waiting_contact_info') {
            delete sessions[from];
            await sock.sendMessage(from, { text: `✅ ¡Recibido! He pasado tus datos directamente al Administrador. Te contactaremos pronto. 🐺` });
            await sock.sendMessage(ADMIN_NUMBER, {
                text: `🐺 *NUEVO CLIENTE SOLICITA ATENCIÓN*\n\n*Datos:* \n${text}\n\n*WhatsApp del Usuario:* \nwa.me/${userNumber}`
            });
            try {
                const newRef = push(ref(db, 'talk_requests'));
                await update(newRef, { name: pushName, datos_cliente: text, number: userNumber, timestamp: Date.now() });
            } catch (e) {}
            return;
        }

        // --- FUNCION AUXILIAR PARA ENVIAR IMAGEN SEGURA ---
        const sendLoboImage = async (jid, caption) => {
            try {
                await sock.sendMessage(jid, { image: { url: LOGO_PREMIUM }, caption });
            } catch (err) {
                console.log("Error enviando imagen, enviando solo texto...");
                await sock.sendMessage(jid, { text: caption });
            }
        };

        // --- RESPUESTAS ---
        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            await sendLoboImage(from, `👋 ¡Hola ${pushName}! 🐺\n\nHe recibido los detalles de tu pedido. Un asesor lo revisará de inmediato.\n\n✅ *Registrado en sistema Modo Premium.*`);
            return;
        }

        if (mensaje === 'hola' || mensaje === 'menu' || mensaje === 'lobo' || mensaje === 'menú') {
            await sendLoboImage(from, `🐺 *CENTRAL DE VENTAS LOBO STORE* 🐺\n\nHola *${pushName}*, bienvenido a nuestra atención Premium. ¿En qué podemos ayudarte?\n\n1️⃣ *Ver Catálogo Premium* 📦\n2️⃣ *Promociones del Mes* 🔥\n3️⃣ *Horarios y Entregas* 🕒\n4️⃣ *Hablar con Administrador* 👨‍💼\n\n🌐 *Tienda Online:* \nhttps://producto-enventa-63d4e.firebaseapp.com/`);
            return;
        }

        if (mensaje === '4') {
            sessions[from] = 'waiting_contact_info';
            await sock.sendMessage(from, { text: `👨‍💼 *CONTACTO PERSONALIZADO*\n\nPor favor, escribe tu *Nombre Completo* y el *Número de Teléfono* donde deseas que te contactemos.` });
            return;
        }

        if (mensaje === '1') {
            await sock.sendMessage(from, { text: `🚀 Entra aquí para ver el inventario actualizado:\nhttps://producto-enventa-63d4e.firebaseapp.com/` });
        }
    });
}

connectToWhatsApp().catch(err => console.log("Error critico: " + err));
