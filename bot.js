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

// 🐺 CONFIGURACIÓN LOGO (Logo Principal Oficial)
const LOGO_LOBO = 'https://i.postimg.cc/JyW9Jt8R/logo-lobo.png';
const LOGO_PATH = path.join(__dirname, 'app/src/main/res/drawable/ic_store_logo.png');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    console.log(`🐺 LOBO STORE BOT - Iniciando...`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store Bot', 'Chrome', '1.0.0'],
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2
                            },
                            ...message
                        }
                    }
                };
            }
            return message;
        }
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
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const mensaje = text.toLowerCase().trim();

        // 1. DETECTAR PEDIDO DESDE LA WEB
        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            const lines = text.split('\n');
            let cliente = "Cliente";
            for (let line of lines) {
                if (line.includes('*Cliente:*')) {
                    cliente = line.replace('*Cliente:*', '').trim();
                    break;
                }
            }

            await sock.sendMessage(from, {
                image: { url: LOGO_PATH },
                caption: `👋 ¡Hola *${cliente}*! 🐺

Bienvenido a *VENTAS LOBO STORE*.

He recibido los detalles de tu pedido realizado desde nuestra web. Un asesor humano revisará la disponibilidad ahora mismo y te contactará en este chat.

✅ *Tu pedido ha sido registrado con éxito en nuestro sistema.*

Si tienes alguna duda adicional, puedes escribirla aquí mismo.`
            });
            return; // Detener aquí para no mostrar el menú de nuevo
        }

        // 2. MENÚ PRINCIPAL (Activadores manuales)
        if (mensaje === 'hola' || mensaje === 'menu' || mensaje === 'menú' || mensaje === 'lobo') {
            await sock.sendMessage(from, {
                image: { url: LOGO_PATH },
                caption: `🐺 *CENTRAL DE VENTAS LOBO STORE* 🐺

¡Hola! Soy el asistente oficial de la tienda. ¿Cómo puedo ayudarte?

1️⃣ *Ver Catálogo Premium* 📦
2️⃣ *Promociones activas* 🔥
3️⃣ *Horarios y Entregas* 🕒
4️⃣ *Hablar con un asesor* 👨‍💼

🌐 *Nuestra Web:*
https://producto-enventa-63d4e.firebaseapp.com/

Escribe el número de la opción que desees.`
            });
        }

        // OPCIONES ADICIONALES
        if (mensaje === '1') {
            await sock.sendMessage(from, {
                text: `🚀 *CATÁLOGO DISPONIBLE*

• AirPods Pro 2da Gen
• Cargadores 20W Originales
• Cases y Protecciones

Puedes ver fotos y precios reales en nuestra tienda online:
https://producto-enventa-63d4e.firebaseapp.com/`
            });
        }

        if (mensaje === '3') {
            await sock.sendMessage(from, {
                text: `🕒 *HORARIOS Y ENTREGAS*

📅 Lunes a Sábado: 9 AM - 7 PM
📍 Entregas personales en Los Mochis.
📦 Envíos a todo México disponibles.`
            });
        }

        if (mensaje === '4') {
            await sock.sendMessage(from, {
                text: `👨‍💼 *CONTACTANDO ASESOR...*

Le he enviado una notificación a nuestro equipo. Te responderán por aquí en unos minutos. 🐺`
            });
        }
    });
}

connectToWhatsApp().catch(err => console.log("Error: " + err));
