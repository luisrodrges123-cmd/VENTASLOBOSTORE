const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    jidDecode
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// 🐺 CONFIGURACIÓN LOGO
const LOGO_LOBO = 'https://storage.googleapis.com/static.smart-chat.ai/v1/user-images/f77b9468-d064-4e35-a1c6-29177114b01d/20250212015037_12.jpg';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`🐺 LOBO STORE BOT - Versión Baileys: ${version.join('.')}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('🐺 ESCANEA EL CÓDIGO QR PARA CONECTAR EL BOT:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ?
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            console.log('Conexión cerrada. Reconectando...', shouldReconnect);
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('✅ ¡CONEXIÓN EXITOSA! EL BOT DE LOBO STORE ESTÁ ACTIVO 🐺');
        }
    });

    // --- LÓGICA DE MENSAJES ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const mensaje = text.toLowerCase().trim();

        // --- MENÚ PRINCIPAL ---
        if (mensaje === 'hola' || mensaje === 'menu' || mensaje === 'menú') {
            await sock.sendMessage(from, {
                image: { url: LOGO_LOBO },
                caption: `🐺 *BIENVENIDO A VENTAS LOBO STORE* 🐺

¡Hola! Soy tu asistente virtual. ¿En qué puedo ayudarte hoy?

1️⃣ *Ver Catálogo Completo* 📦
2️⃣ *Promociones del día* 🔥
3️⃣ *Horarios y Ubicación* 🕒
4️⃣ *Hablar con un asesor* 👨‍💼

🌐 *Tienda Online:*
https://producto-enventa-63d4e.firebaseapp.com/

Responde con el número de tu opción.`
            });
        }

        // --- OPCIÓN 1: CATÁLOGO ---
        if (mensaje === '1' || mensaje.includes('catálogo')) {
            await sock.sendMessage(from, {
                text: `🚀 *CATÁLOGO LOBO STORE* 🚀

Tenemos lo mejor en tecnología:
✅ AirPods Pro (Premium)
✅ Cargadores iPhone 20W
✅ Fundas y Accesorios

*¿Quieres comprar?*
Visita nuestra web o responde *REGISTRAR*.`
            });
        }

        // --- REGISTRO ---
        if (mensaje === 'registrar' || mensaje === 'comprar') {
            await sock.sendMessage(from, {
                text: `📝 *PROCESO DE PEDIDO*

Para agendar tu pedido, por favor envíanos:
1. *Nombre Completo:*
2. *Producto:*
3. *Ciudad:*

Un asesor te contactará pronto. 🐺`
            });
        }

        // --- HORARIOS ---
        if (mensaje === '3') {
            await sock.sendMessage(from, {
                text: `🕒 *HORARIOS*

📅 *Lunes a Sábado:* 9:00 AM - 7:00 PM
📍 Los Mochis, Sinaloa.`
            });
        }

        // --- ASESOR ---
        if (mensaje === '4' || mensaje.includes('asesor')) {
            await sock.sendMessage(from, {
                text: `👨‍💼 *Aviso enviado.*

Un asesor humano de *LOBO STORE* revisará tu mensaje en breve. 🐺`
            });
        }
    });
}

// Iniciar la conexión
connectToWhatsApp().catch(err => console.log("Error inesperado: " + err));
