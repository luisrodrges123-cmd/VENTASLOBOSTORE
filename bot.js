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
const { getDatabase, ref, push, update, onValue, set, get } = require('firebase/database');
const fs = require('fs');
const express = require('express');

// 🐺 CONFIGURACIÓN MAESTRA LOBO STORE
const LOGO_OFFICIAL = 'https://i.postimg.cc/VNS1xbH0/logo-lobo.png';
const ADMIN_JID = '5216682515249@s.whatsapp.net';
const SESSION_PATH = 'auth_info_baileys';

// --- FIREBASE INFRAESTRUCTURA ---
const firebaseConfig = { databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com" };
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// --- MONITOR DE SESIÓN ---
const sessions = {};

// Monitor de comandos remotos
onValue(ref(db, "bot_control/command"), async (snapshot) => {
    const cmd = snapshot.val();
    if (cmd && cmd.action === "LOGOUT") {
        await set(ref(db, "bot_control/command"), null);
        if (fs.existsSync(SESSION_PATH)) fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        process.exit(0);
    }
});

// --- SERVIDOR WEB ---
const app_web = express();
const port = process.env.PORT || 3000;
let currentQR = null;
app_web.get('/', (req, res) => {
    if (currentQR) {
        QRCode.toDataURL(currentQR, (err, url) => {
            res.send(`<html><body style="background:#000;color:#00F2FF;text-align:center;padding:50px;"><img src="${LOGO_OFFICIAL}" style="width:100px;"><br><h1>VINCULAR BOT</h1><img src="${url}"><p>Escanea para activar.</p></body></html>`);
        });
    } else { res.send('<h1>🐺 Lobo Store Online 🚀</h1>'); }
});

// --- MOTOR DEL BOT ---
async function startLoboBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
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
        if (qr) { currentQR = qr; qrcodeTerminal.generate(qr, { small: true }); }
        if (connection === 'close') {
            currentQR = null;
            if ((lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) startLoboBot();
        } else if (connection === 'open') { currentQR = null; console.log('✅ BOT CONECTADO 🐺'); }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const userJid = jidNormalizedUser(from).split('@')[0];
        const pushName = msg.pushName || 'Cliente';
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const lowerText = text.toLowerCase();

        // 1. SINCRONIZACIÓN DE USUARIO
        const userRef = ref(db, `bot_users/${userJid}`);
        let userData = {};
        try { const snap = await get(userRef); if (snap.exists()) userData = snap.val(); } catch (e) {}

        const displayName = userData.name || pushName;
        update(userRef, { whatsapp_name: pushName, last_seen: Date.now() });

        const sendLobo = async (jid, caption) => {
            try { await sock.sendMessage(jid, { image: { url: LOGO_OFFICIAL }, caption }); }
            catch (e) { await sock.sendMessage(jid, { text: caption }); }
        };

        // --- FLUJO DE CAPTURA DE NÚMERO ---
        if (sessions[from] === 'waiting_number') {
            delete sessions[from];

            // Extraer solo números
            const providedNumber = text.replace(/\D/g, '');
            const finalContactNumber = providedNumber.length >= 10 ? providedNumber : userJid;

            await sock.sendMessage(from, { text: `✅ ¡Recibido! He guardado tu número: *${finalContactNumber}*. El administrador te contactará muy pronto. 🐺` });

            // AVISO AL ADMIN (+52 1 668 251 5249)
            await sock.sendMessage(ADMIN_JID, {
                text: `🐺 *SOLICITUD DE ASESORÍA*\n\n*Usuario:* ${displayName}\n*Número proporcionado:* ${finalContactNumber}\n\n🔗 *Link WhatsApp Directo:* \nwa.me/${finalContactNumber}\n\n🔗 *Chat de origen:* \nwa.me/${userJid}`
            });

            // Registrar en Panel Admin
            try {
                await push(ref(db, 'talk_requests'), {
                    name: displayName,
                    number: finalContactNumber,
                    whatsapp_id: userJid,
                    message: text,
                    timestamp: Date.now()
                });
                // Actualizar ficha del cliente con el número que él mismo dio
                await update(userRef, { number: finalContactNumber, phone: finalContactNumber });
            } catch (e) {}
            return;
        }

        // --- COMANDOS ---
        if (['hola', 'menu', 'lobo'].includes(lowerText)) {
            await sendLobo(from, `🐺 *CENTRAL DE VENTAS LOBO STORE* 🐺\n\nHola *${displayName}*, bienvenido. Elige una opción:\n\n1️⃣ Catálogo Premium 📦\n4️⃣ Hablar con Administrador 👨‍💼`);
            return;
        }

        if (lowerText === '1') {
            await sock.sendMessage(from, { text: `🚀 Explora aquí:\nhttps://producto-enventa-63d4e.firebaseapp.com/` });
            return;
        }

        if (lowerText === '4') {
            sessions[from] = 'waiting_number';
            await sock.sendMessage(from, { text: `👨‍💼 *CONTACTO PERSONALIZADO*\n\nPor favor, escribe tu *Nombre Completo* y tu *Número de Teléfono* para que el administrador te contacte personalmente.` });
            return;
        }

        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            await sendLobo(from, `👋 ¡Hola *${displayName}*! 🐺\n\nHe recibido tu pedido con éxito. Un asesor lo revisará de inmediato.\n\n✅ *Registrado en sistema.*`);
        }
    });
}

app_web.listen(port, () => startLoboBot().catch(e => console.error(e)));
