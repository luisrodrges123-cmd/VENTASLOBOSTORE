const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push, update, onValue, set } = require('firebase/database');
const fs = require('fs');
const path = require('path');

// 🐺 CONFIGURACIÓN GLOBAL (MODO PC PREMIUM)
const LOGO_PREMIUM = 'https://storage.googleapis.com/static.smart-chat.ai/v1/user-images/f77b9468-d064-4e35-a1c6-29177114b01d/20250212061917_29.jpg';
const ADMIN_NUMBER = '5216682515249@s.whatsapp.net';
const AUTH_PATH = 'auth_info_baileys';

// --- FIREBASE ---
const firebaseConfig = { databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com" };
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const sessions = {};

// --- LÓGICA DE CONTROL REMOTO (LOGOUT DESDE WEB) ---
onValue(ref(db, "bot_control/command"), async (snapshot) => {
    const cmd = snapshot.val();
    if (cmd && cmd.action === "LOGOUT") {
        console.log("\n🔥 COMANDO RECIBIDO: CERRANDO SESIÓN Y REINICIANDO...");
        await set(ref(db, "bot_control/command"), null);
        try {
            if (fs.existsSync(AUTH_PATH)) {
                fs.rmSync(AUTH_PATH, { recursive: true, force: true });
                console.log("✅ Sesión local eliminada.");
            }
        } catch (e) { console.log("Error: " + e.message); }
        process.exit(0);
    }
});

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
    const { version } = await fetchLatestBaileysVersion();

    console.log('\n======================================================');
    console.log('       🐺 LOBO STORE - MODO PC PREMIUM 24/7 🐺');
    console.log('======================================================\n');

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true, // Imprimir QR en la consola de la PC
        auth: state,
        browser: ['Lobo Store PC', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📢 ESCANEA EL CÓDIGO QR PARA CONECTAR EL BOT:');
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const code = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0;
            console.log(`[!] Conexión cerrada (${code}). Reconectando en 5 segundos...`);
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            console.log('✅ ¡CONEXIÓN EXITOSA! EL BOT ESTÁ ACTIVO EN TU PC 🐺🚀');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const pushName = msg.pushName || 'Cliente';
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const mensaje = text.toLowerCase();
        const userNumber = jidNormalizedUser(from).split('@')[0];

        // Registro de usuario en Firebase
        try { update(ref(db, 'bot_users/' + userNumber), { pushName, number: userNumber, lastSeen: Date.now() }); } catch (e) {}

        const sendLobo = async (jid, caption) => {
            try { await sock.sendMessage(jid, { image: { url: LOGO_PREMIUM }, caption }); }
            catch (err) { await sock.sendMessage(jid, { text: caption }); }
        };

        // --- RESPUESTAS ---
        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            await sendLobo(from, `👋 ¡Hola ${pushName}! 🐺\n\nTu pedido ha sido recibido. Un asesor revisará la disponibilidad de inmediato.\n\n✅ *Registrado en sistema Modo PC Premium.*`);
            return;
        }

        if (mensaje === 'hola' || mensaje === 'menu' || mensaje === 'lobo' || mensaje === 'menú') {
            await sendLobo(from, `🐺 *CENTRAL DE VENTAS LOBO STORE* 🐺\n\nHola *${pushName}*, bienvenido al servicio oficial. ¿En qué podemos ayudarte?\n\n1️⃣ *Catálogo de Productos* 📦\n2️⃣ *Promociones* 🔥\n3️⃣ *Horarios y Entregas* 🕒\n4️⃣ *Hablar con Administrador* 👨‍💼\n\n🌐 *Tienda Online:* \nhttps://producto-enventa-63d4e.firebaseapp.com/`);
        }

        if (mensaje === '4') {
            await sock.sendMessage(from, { text: `👨‍💼 *CONTACTO PERSONALIZADO*\n\nPor favor, escribe tu *Nombre Completo* y tu *Número de Teléfono* para que el administrador te contacte directamente.` });

            // Aviso al Admin
            await sock.sendMessage(ADMIN_NUMBER, { text: `🐺 *AVISO PC*\n\nEl usuario *${pushName}* quiere hablar contigo.\nWhatsApp: wa.me/${userNumber}` });

            try {
                const newRef = push(ref(db, 'talk_requests'));
                await update(newRef, { name: pushName, number: userNumber, timestamp: Date.now() });
            } catch (e) {}
        }

        if (mensaje === '1') {
            await sock.sendMessage(from, { text: `🚀 Explora nuestro inventario aquí:\nhttps://producto-enventa-63d4e.firebaseapp.com/` });
        }
    });
}

connectToWhatsApp().catch(err => setTimeout(() => connectToWhatsApp(), 5000));
