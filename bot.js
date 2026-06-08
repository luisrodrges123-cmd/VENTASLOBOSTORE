const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    proto
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, push, update, onValue, set } = require('firebase/database');
const fs = require('fs');

// 🐺 CONFIGURACIÓN GLOBAL LOBO STORE
const LOGO_URL = 'https://i.postimg.cc/VNS1xbH0/logo-lobo.png';
const ADMIN_NUMBER = '5216682515249@s.whatsapp.net';
const AUTH_FOLDER = 'auth_info_baileys';

// --- FIREBASE SETUP ---
const firebaseConfig = { databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com" };
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version } = await fetchLatestBaileysVersion();

    console.log('\n---------------------------------------------------');
    console.log('      🐺 LOBO STORE BOT - SISTEMA PREMIUM 2.0 🐺');
    console.log('---------------------------------------------------\n');

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store Server', 'Safari', '3.0']
    });

    sock.ev.on('creds.update', saveCreds);

    // --- ESCUCHADOR DE CONTROL REMOTO (LOGOUT) ---
    onValue(ref(db, "bot_control/command"), async (snapshot) => {
        const cmd = snapshot.val();
        if (cmd && cmd.action === "LOGOUT") {
            console.log('🔥 ORDEN DE CIERRE RECIBIDA DESDE EL ADMIN...');
            await set(ref(db, "bot_control/command"), null);
            if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
            process.exit(0);
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📢 ESCANEA ESTE CÓDIGO QR PARA ACTIVAR:');
            qrcodeTerminal.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const code = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output.statusCode : 0;
            console.log(`[!] Conexión perdida (Code: ${code}). Reiniciando...`);
            if (code !== DisconnectReason.loggedOut) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ BOT CONECTADO EXITOSAMENTE A WHATSAPP 🐺🚀');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const pushName = msg.pushName || 'Cliente';
        const userNumber = jidNormalizedUser(from).split('@')[0];
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const lowerText = text.toLowerCase();

        console.log(`📩 Mensaje de ${pushName} (${userNumber}): ${text}`);

        // --- REGISTRO DE USUARIO ---
        try {
            update(ref(db, `bot_users/${userNumber}`), {
                name: pushName,
                lastSeen: Date.now(),
                phone: userNumber
            });
        } catch (e) {}

        // --- FUNCIÓN UNIVERSAL DE RESPUESTA CON LOGO ---
        const responderConLogo = async (jid, caption) => {
            try {
                await sock.sendMessage(jid, {
                    image: { url: LOGO_URL },
                    caption: caption
                });
            } catch (err) {
                console.log("Error enviando logo, enviando solo texto...");
                await sock.sendMessage(jid, { text: caption });
            }
        };

        // --- FLUJO DE RESPUESTAS ---

        // 1. Detección de pedido desde la web
        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            await responderConLogo(from, `👋 ¡Hola ${pushName}! 🐺\n\nHe recibido los detalles de tu pedido. Estamos revisando el stock en este momento.\n\n✅ *Tu solicitud ya está en nuestro sistema.*`);
            return;
        }

        // 2. Menú de Bienvenida
        if (['hola', 'menu', 'menú', 'lobo', 'hi'].includes(lowerText)) {
            await responderConLogo(from, `🐺 *VENTAS LOBO STORE* 🐺\n\nHola *${pushName}*, bienvenido al servicio oficial de atención al cliente.\n\n1️⃣ Ver Catálogo Premium 📦\n4️⃣ Hablar con Administrador 👨‍💼\n\n🌐 *Tienda Online:* \nhttps://producto-enventa-63d4e.firebaseapp.com/`);
            return;
        }

        // 3. Opción 1: Catálogo
        if (lowerText === '1') {
            await sock.sendMessage(from, { text: `🚀 *EXPLORA NUESTROS PRODUCTOS*\n\nEntra aquí para ver precios y fotos reales:\nhttps://producto-enventa-63d4e.firebaseapp.com/` });
            return;
        }

        // 4. Opción 4: Hablar con Admin
        if (lowerText === '4') {
            await sock.sendMessage(from, { text: `👨‍💼 *CONTACTO PERSONALIZADO*\n\nHe notificado al Administrador sobre tu interés. Por favor, envíanos tu *Nombre Completo* y pronto te contactaremos.` });

            // Aviso al Admin (+52 1 668 251 5249)
            await sock.sendMessage(ADMIN_NUMBER, {
                text: `🐺 *AVISO DE ATENCIÓN*\n\nEl usuario *${pushName}* quiere hablar contigo.\n\n📱 Número: ${userNumber}\n🔗 Chat: wa.me/${userNumber}`
            });

            try {
                await push(ref(db, 'talk_requests'), {
                    name: pushName,
                    number: userNumber,
                    timestamp: Date.now()
                });
            } catch (e) {}
            return;
        }
    });
}

connectToWhatsApp().catch(err => console.log("Error crítico: " + err));
