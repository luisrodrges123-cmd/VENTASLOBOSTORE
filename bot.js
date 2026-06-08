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

// 🐺 CONFIGURACIÓN GLOBAL
const LOGO_URL = 'https://i.postimg.cc/VNS1xbH0/logo-lobo.png';
const ADMIN_NUMBER = '5216682515249@s.whatsapp.net';
const AUTH_FOLDER = 'auth_info_baileys';

const firebaseConfig = { databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com" };
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const sessions = {};

const getRealNumber = (jid) => jidNormalizedUser(jid).split('@')[0];
const extractPhoneNumber = (text) => {
    const cleaned = text.replace(/\D/g, '');
    return cleaned.length >= 10 ? cleaned : null;
};

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store Control', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    // CONTROL REMOTO LOGOUT
    onValue(ref(db, "bot_control/command"), async (snapshot) => {
        const cmd = snapshot.val();
        if (cmd && cmd.action === "LOGOUT") {
            await set(ref(db, "bot_control/command"), null);
            if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            process.exit(0);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcodeTerminal.generate(qr, { small: true });
        if (connection === 'close') {
            if ((lastDisconnect.error instanceof Boom) && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) connectToWhatsApp();
        } else if (connection === 'open') console.log('✅ BOT ONLINE 🐺');
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const userJid = getRealNumber(from);
        const pushName = msg.pushName || 'Cliente';
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const lowerText = text.toLowerCase();

        // --- REGISTRO/ACTUALIZACIÓN DE USUARIO ---
        const userRef = ref(db, `bot_users/${userJid}`);
        // No sobreescribir el nombre si el admin ya le puso uno personalizado
        update(userRef, {
            whatsapp_name: pushName,
            whatsapp_number: userJid,
            last_seen: Date.now()
        });

        const sendLobo = async (jid, caption) => {
            try { await sock.sendMessage(jid, { image: { url: LOGO_URL }, caption }); }
            catch (e) { await sock.sendMessage(jid, { text: caption }); }
        };

        // --- FLUJO CAPTURA DE DATOS (NUEVO NÚMERO) ---
        if (sessions[from] === 'waiting_contact_info') {
            const detected = extractPhoneNumber(text);
            if (!detected) {
                await sock.sendMessage(from, { text: `❌ No reconozco ese número. Por favor envía tu número a 10 dígitos.` });
                return;
            }
            delete sessions[from];

            // GUARDAR EL NUEVO NÚMERO EN EL USUARIO
            await update(userRef, {
                name: pushName, // Guardar nombre proporcionado o actual
                number: detected, // EL NUEVO NÚMERO
                phone: detected
            });

            await sock.sendMessage(from, { text: `✅ ¡Datos actualizados! He guardado tu número: *${detected}*. El Administrador te contactará pronto. 🐺` });
            await sock.sendMessage(ADMIN_NUMBER, { text: `🐺 *AVISO ACTUALIZADO*\n\nUsuario: ${pushName}\nNuevo Número: ${detected}\nWhatsApp: wa.me/${userJid}` });

            try { await push(ref(db, 'talk_requests'), { name: pushName, number: detected, whatsapp: userJid, timestamp: Date.now() }); } catch (e) {}
            return;
        }

        // --- COMANDOS ---
        if (['hola', 'menu', 'lobo'].includes(lowerText)) {
            await sendLobo(from, `🐺 *LOBO STORE PREMIUM* 🐺\n\nHola, bienvenido. Elige una opción:\n\n1️⃣ Catálogo\n4️⃣ Hablar con Administrador (Dejar mis datos)`);
            return;
        }

        if (lowerText === '4') {
            sessions[from] = 'waiting_contact_info';
            await sock.sendMessage(from, { text: `👨‍💼 *DEJA TUS DATOS*\n\nPor favor, escribe tu *Nombre* y tu *Número de Teléfono* para actualizar tu ficha de cliente y contactarte.` });
        }
    });
}

connectToWhatsApp().catch(e => console.log(e));
