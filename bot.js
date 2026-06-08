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

// 🐺 INFRAESTRUCTURA DE CONTROL LOBO STORE
const LOGO_OFFICIAL = 'https://i.postimg.cc/VNS1xbH0/logo-lobo.png';
const ADMIN_JID = '5216682515249@s.whatsapp.net';
const SESSION_PATH = 'auth_info_baileys';

const firebaseConfig = { databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com" };
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const sessions = {};

const getCleanID = (jid) => jidNormalizedUser(jid).split('@')[0];
const isLID = (jid) => jid.includes('@lid') || jidNormalizedUser(jid).length > 13;
const formatPhoneForWA = (text) => {
    const cleaned = text.replace(/\D/g, '');
    return (cleaned.length >= 10 && cleaned.length <= 15) ? cleaned : null;
};

// --- MONITOR REMOTO ---
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
            res.send(`<html><body style="background:#050505;color:#00F2FF;text-align:center;padding:50px;font-family:sans-serif;">
                <img src="${LOGO_OFFICIAL}" style="width:120px;border-radius:20px;box-shadow:0 0 20px #00F2FF;margin-bottom:20px;">
                <h1>PANEL DE VINCULACIÓN</h1><div style="background:white;padding:20px;display:inline-block;border-radius:20px;"><img src="${url}"></div>
                <p>Escanea este código para conectar el Bot de Lobo Store.</p></body></html>`);
        });
    } else { res.send('<h1>🐺 Lobo Store está Online 🚀</h1>'); }
});

async function startProfessionalBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store Pro', 'Safari', '3.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) { currentQR = qr; qrcodeTerminal.generate(qr, { small: true }); }
        if (connection === 'close') {
            currentQR = null;
            if ((lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) startProfessionalBot();
        } else if (connection === 'open') { currentQR = null; console.log('✅ SISTEMA PREMIUM CONECTADO 🐺🚀'); }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const userWAID = getCleanID(from);
        const pushName = msg.pushName || 'Cliente';
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const lowerText = text.toLowerCase();

        // 1. SINCRONIZACIÓN DE USUARIO CON BASE DE DATOS
        const userRef = ref(db, `bot_users/${userWAID}`);
        let userData = {};
        try { const snap = await get(userRef); if (snap.exists()) userData = snap.val(); } catch (e) {}

        const finalDisplayName = userData.name || pushName;

        // --- ACTUALIZACIÓN DE ACTIVIDAD ---
        update(userRef, { whatsapp_name: pushName, last_seen: Date.now() });

        const sendLobo = async (jid, caption) => {
            try { await sock.sendMessage(jid, { image: { url: LOGO_OFFICIAL }, caption }); }
            catch (e) { await sock.sendMessage(jid, { text: caption }); }
        };

        // --- FLUJO DE CAPTURA DE CONTACTO ---
        if (sessions[from] === 'waiting_data') {
            delete sessions[from];

            const detectedPhone = formatPhoneForWA(text);
            // PRIORIDAD: 1. Numero en mensaje, 2. Numero en base de datos, 3. WA ID (LID)
            const saveNumber = detectedPhone || userData.number || userData.phone || userWAID;
            const lastSeenDate = userData.last_seen ? new Date(userData.last_seen).toLocaleString() : 'En línea ahora';

            await sock.sendMessage(from, { text: `✅ ¡Perfecto! He recibido tus datos. El administrador se pondrá en contacto contigo a la brevedad. 🐺` });

            // NOTIFICACIÓN DETALLADA AL ADMINISTRADOR
            const aviso = `🐺 *NUEVA SOLICITUD DE ASESORÍA*\n\n` +
                          `👤 *Nombre Perfil:* ${pushName}\n` +
                          `🆔 *Nombre en Admin:* ${userData.name || 'Sin asignar'}\n` +
                          `📱 *Contacto (MSJ):* ${detectedPhone || 'No proporcionado'}\n` +
                          `📞 *Número en DB:* ${userData.number || userData.phone || 'No registrado'}\n` +
                          `🌍 *WhatsApp ID:* ${userWAID} ${isLID(from) ? '(LID)' : ''}\n` +
                          `🕒 *Última actividad:* ${lastSeenDate}\n\n` +
                          `💬 *Mensaje del usuario:* \n"${text}"\n\n` +
                          `🔗 *Link Directo (Número):* \nwa.me/${saveNumber.toString().replace(/\D/g,'')}\n` +
                          `🔗 *Link Directo (WA ID):* \nwa.me/${userWAID}`;

            await sock.sendMessage(ADMIN_JID, { text: aviso });

            // Registro en Firebase
            try {
                await push(ref(db, 'talk_requests'), {
                    name: finalDisplayName,
                    number: saveNumber,
                    whatsapp_id: userWAID,
                    timestamp: Date.now(),
                    full_info_sent: aviso
                });
                if(detectedPhone) await update(userRef, { number: detectedPhone, phone: detectedPhone });
            } catch (e) {}
            return;
        }

        // --- COMANDOS ---
        if (['hola', 'menu', 'lobo', 'menú'].includes(lowerText)) {
            await sendLobo(from, `🐺 *CENTRAL DE VENTAS LOBO STORE* 🐺\n\nHola *${finalDisplayName}*, bienvenido. Elige una opción:\n\n1️⃣ Catálogo Premium 📦\n4️⃣ Hablar con Administrador 👨‍💼`);
            return;
        }

        if (lowerText === '1') {
            await sock.sendMessage(from, { text: `🚀 Explora aquí:\nhttps://producto-enventa-63d4e.firebaseapp.com/` });
            return;
        }

        if (lowerText === '4') {
            sessions[from] = 'waiting_data';
            await sock.sendMessage(from, { text: `👨‍💼 *CONTACTO PERSONALIZADO*\n\nPor favor, escribe tu *Nombre Completo* y tu *Número de Teléfono* para que el administrador te contacte personalmente.` });
            return;
        }

        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            await sendLobo(from, `👋 ¡Hola *${finalDisplayName}*! 🐺\n\nHe recibido tu pedido con éxito. Un asesor te contactará de inmediato.\n\n✅ *Registrado en sistema.*`);
        }
    });
}

app_web.listen(port, () => startProfessionalBot().catch(e => console.error(e)));
