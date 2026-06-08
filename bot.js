const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push, update, onValue, set } = require('firebase/database');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN GLOBAL ---
const LOGO_PREMIUM = 'https://storage.googleapis.com/static.smart-chat.ai/v1/user-images/f77b9468-d064-4e35-a1c6-29177114b01d/20250212061917_29.jpg';
const ADMIN_NUMBER = '5216682515249@s.whatsapp.net';
const AUTH_PATH = 'auth_info_baileys';
let lastQR = null;

// --- FIREBASE ---
const firebaseConfig = { databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com" };
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// --- SERVIDOR WEB ---
const app_web = express();
const port = process.env.PORT || 3000;
app_web.get('/', (req, res) => {
    if (lastQR) {
        QRCode.toDataURL(lastQR, (err, url) => {
            res.send(`<html><body style="background:#050505; color:#00F2FF; text-align:center; padding:50px; font-family:sans-serif;">
                <img src="${LOGO_PREMIUM}" style="width:100px; border-radius:20px; box-shadow:0 0 20px #00F2FF; margin-bottom:20px;">
                <h1>QR LOBO STORE</h1><div style="background:white; padding:20px; display:inline-block; border-radius:20px;"><img src="${url}"></div>
                <p>Escanea este código para conectar el bot.</p></body></html>`);
        });
    } else { res.send('<h1>🐺 Lobo Store está Online 🚀</h1>'); }
});
app_web.listen(port);

// --- LÓGICA DE CONTROL REMOTO (LOGOUT) ---
onValue(ref(db, "bot_control/command"), async (snapshot) => {
    const cmd = snapshot.val();
    if (cmd && cmd.action === "LOGOUT") {
        console.log("🔥 COMANDO RECIBIDO: CERRANDO SESIÓN...");
        await set(ref(db, "bot_control/command"), null); // Limpiar comando

        try {
            if (fs.existsSync(AUTH_PATH)) {
                fs.rmSync(AUTH_PATH, { recursive: true, force: true });
                console.log("✅ Carpeta de sesión eliminada.");
            }
        } catch (e) { console.log("Error borrando sesión: " + e.message); }

        process.exit(0); // El .bat o Render lo reiniciará automáticamente
    }
});

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version, logger: pino({ level: 'silent' }),
        printQRInTerminal: true, auth: state,
        browser: ['Lobo Store Control', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { lastQR = qr; qrcodeTerminal.generate(qr, { small: true }); }
        if (connection === 'close') {
            lastQR = null;
            const code = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0;
            if (code !== DisconnectReason.loggedOut) setTimeout(() => connectToWhatsApp(), 5000);
        } else if (connection === 'open') { lastQR = null; console.log('✅ BOT ONLINE 🐺'); }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const pushName = msg.pushName || 'Cliente';
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const mensaje = text.toLowerCase();

        // Respuesta básica Menú
        if (mensaje === 'hola' || mensaje === 'menu' || mensaje === 'lobo') {
            await sock.sendMessage(from, {
                image: { url: LOGO_PREMIUM },
                caption: `🐺 *LOBO STORE* 🐺\n\nHola *${pushName}*, bienvenido.\n\n1️⃣ Catálogo\n4️⃣ Hablar con Administrador\n\n🌐 https://producto-enventa-63d4e.firebaseapp.com/`
            });
        }
    });
}

connectToWhatsApp().catch(err => console.log("Error: " + err));
