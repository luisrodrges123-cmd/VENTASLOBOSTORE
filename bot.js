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
const { getDatabase, ref, push, update } = require('firebase/database');
const express = require('express');

// --- CONFIGURACIÓN GLOBAL ---
const LOGO_PREMIUM = 'https://storage.googleapis.com/static.smart-chat.ai/v1/user-images/f77b9468-d064-4e35-a1c6-29177114b01d/20250212053139_23.jpg';
const ADMIN_NUMBER = '5216682515249@s.whatsapp.net';
let lastQR = null;

// --- SERVIDOR WEB PARA QR Y KEEP-ALIVE ---
const app_web = express();
const port = process.env.PORT || 3000;

app_web.get('/', (req, res) => {
    if (lastQR) {
        QRCode.toDataURL(lastQR, (err, url) => {
            res.send(`
                <html>
                <head><title>QR LOBO STORE</title></head>
                <body style="background:#050505; color:#00F2FF; text-align:center; font-family:sans-serif; padding:50px;">
                    <img src="${LOGO_PREMIUM}" style="width:100px; border-radius:20px; box-shadow:0 0 20px #00F2FF; margin-bottom:20px;">
                    <h1>SISTEMA LOBO STORE PREMIUM</h1>
                    <p>Escanea este código con tu WhatsApp:</p>
                    <div style="background:white; padding:20px; display:inline-block; border-radius:20px;">
                        <img src="${url}">
                    </div>
                    <p style="color:grey; margin-top:20px;">Si el código no carga, refresca la página (F5).</p>
                </body>
                </html>
            `);
        });
    } else {
        res.send('<h1>🐺 Lobo Store está Online 🚀</h1><p>Si necesitas escanear el QR, espera unos segundos y refresca.</p>');
    }
});

app_web.listen(port, () => console.log(`🌍 Servidor Premium en puerto ${port}`));

// 🐺 FIREBASE
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
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store 24/7', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            lastQR = qr;
            console.log('🐺 QR GENERADO. Míralo en la consola o en la URL de Render.');
            qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === 'close') {
            lastQR = null;
            const code = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0;
            if (code !== DisconnectReason.loggedOut) {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            lastQR = null;
            console.log('✅ BOT LOBO STORE ONLINE 24/7 🐺💎');
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

        try { update(ref(db, 'bot_users/' + userNumber), { pushName, number: userNumber, lastSeen: Date.now() }); } catch (e) {}

        const sendLobo = async (jid, caption) => {
            try { await sock.sendMessage(jid, { image: { url: LOGO_PREMIUM }, caption }); }
            catch (err) { await sock.sendMessage(jid, { text: caption }); }
        };

        if (sessions[from] === 'waiting_contact_info') {
            const detected = extractPhoneNumber(text);
            if (!detected) {
                await sock.sendMessage(from, { text: `❌ Por favor, envía tu número de teléfono a 10 dígitos para contactarte.` });
                return;
            }
            delete sessions[from];
            await sock.sendMessage(from, { text: `✅ ¡Recibido! El Administrador de *LOBO STORE* te contactará en breve. 🐺` });
            await sock.sendMessage(ADMIN_NUMBER, { text: `🐺 *AVISO 24/7*\n\nUsuario: ${pushName}\nNúmero: ${detected}\nWhatsApp: wa.me/${userNumber}\n\nMensaje: "${text}"` });
            try {
                const newRef = push(ref(db, 'talk_requests'));
                await update(newRef, { name: pushName, numero_detectado: detected, message: text, number: userNumber, timestamp: Date.now() });
            } catch (e) {}
            return;
        }

        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            await sendLobo(from, `👋 ¡Hola ${pushName}! 🐺\n\nTu pedido ha sido recibido. Un asesor humano confirmará todo contigo pronto.\n\n✅ *Registrado con éxito.*`);
            return;
        }

        if (mensaje === 'hola' || mensaje === 'menu' || mensaje === 'lobo' || mensaje === 'menú') {
            await sendLobo(from, `🐺 *CENTRAL DE VENTAS LOBO STORE* 🐺\n\nHola *${pushName}*, bienvenido al servicio Premium 24/7. ¿En qué podemos ayudarte?\n\n1️⃣ *Catálogo de Productos* 📦\n2️⃣ *Promociones* 🔥\n3️⃣ *Horarios y Entregas* 🕒\n4️⃣ *Hablar con Administrador* 👨‍💼\n\n🌐 *Tienda Online:* \nhttps://producto-enventa-63d4e.firebaseapp.com/`);
            return;
        }

        if (mensaje === '4') {
            sessions[from] = 'waiting_contact_info';
            await sock.sendMessage(from, { text: `👨‍💼 *ATENCIÓN PERSONALIZADA*\n\nEscribe tu *Nombre Completo* y tu *Número de Teléfono* para que el administrador te contacte personalmente.` });
            return;
        }

        if (mensaje === '1') {
            await sock.sendMessage(from, { text: `🚀 Explora nuestro catálogo premium aquí:\nhttps://producto-enventa-63d4e.firebaseapp.com/` });
        }
    });
}

connectToWhatsApp().catch(err => setTimeout(() => connectToWhatsApp(), 5000));
