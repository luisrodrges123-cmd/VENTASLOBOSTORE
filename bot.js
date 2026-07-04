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
const { GoogleGenerativeAI } = require("@google/generative-ai");
const NodeCache = require("node-cache");

// --- CARGAR CONFIGURACIÓN ---
let GEMINI_API_KEY = "";
try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    GEMINI_API_KEY = config.GEMINI_API_KEY;
} catch (e) {
    console.error("❌ Error cargando config.json. Asegúrate de que el archivo exista.");
}

// 🐺 CONFIGURACIÓN MAESTRA LOBO STORE
const LOGO_OFFICIAL = 'https://i.postimg.cc/VNS1xbH0/logo-lobo.png';
const ADMIN_JID = '5216682515249@s.whatsapp.net';
const SESSION_PATH = 'auth_info_baileys';

// --- CACHÉ PARA REINTENTOS (FIX "ESPERANDO MENSAJE") ---
const msgRetryCounterCache = new NodeCache();

// --- INICIALIZACIÓN DE IA ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- FIREBASE INFRAESTRUCTURA ---
const firebaseConfig = { databaseURL: "https://producto-enventa-default-rtdb.firebaseio.com" };
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const sessions = {};
let stockAlertsSent = new Set();
let botEnabled = true;

// --- FUNCIONALIDAD DE REGISTRO DE LOGS EN WEB ---
async function logToWeb(type, name, message) {
    try {
        await push(ref(db, 'bot_logs'), {
            type, // 'SISTEMA', 'IA', 'ALERTA', 'CHAT'
            name,
            message,
            timestamp: Date.now()
        });
    } catch (e) {
        console.error("Error al registrar log en web:", e);
    }
}

// --- MONITOR DE ESTADO Y COMANDOS ---
onValue(ref(db, "bot_control/status"), (snapshot) => {
    botEnabled = (snapshot.val() !== "offline");
    const msg = `El bot está: ${botEnabled ? 'ENCENDIDO ✅' : 'APAGADO ❌'}`;
    console.log(`[SISTEMA] ${msg}`);
    logToWeb('SISTEMA', 'CORE', msg);
});

// --- MONITOR DE STOCK BAJO (MODO PREMIUM) ---
function checkStockAlerts() {
    if (!global.botSocket) return;

    get(ref(db, "products")).then((snapshot) => {
        if (!snapshot.exists()) return;
        snapshot.forEach((child) => {
            const p = child.val();
            const stock = parseInt(p.stock);
            const productId = child.key;

            if (stock === 1 && !stockAlertsSent.has(productId)) {
                stockAlertsSent.add(productId);

                const alertMsg = `🐺 *LOBO MONITOR - STOCK CRÍTICO* 🐺\n\n` +
                                 `━━━━━━━━━━━━━━━━━━\n` +
                                 `⚠️ *ATENCIÓN ADMINISTRADOR*\n` +
                                 `El artículo *${p.name.toUpperCase()}* está a punto de agotarse.\n\n` +
                                 `📊 *STOCK ACTUAL:* 1 UNIDAD\n` +
                                 `━━━━━━━━━━━━━━━━━━\n` +
                                 `💡 *Sugerencia:* Repón el stock desde el panel admin para seguir vendiendo.`;

                logToWeb('ALERTA', p.name, 'Stock crítico (1 unidad)');

                global.botSocket.sendMessage(ADMIN_JID, {
                    ...(p.imageUrl && p.imageUrl.startsWith('http') ? { image: { url: p.imageUrl }, caption: alertMsg } : { text: alertMsg })
                }).catch(e => console.error("Error envío Premium Alerta:", e));

            } else if (stock > 1 || stock === 0) {
                stockAlertsSent.delete(productId);
            }
        });
    });
}

onValue(ref(db, "products"), () => {
    console.log("[SISTEMA] Cambio en productos detectado, verificando stock...");
    checkStockAlerts();
});

// Fallback de verificación cada 15 minutos
setInterval(checkStockAlerts, 15 * 60 * 1000);

// --- HELPER: FORMATEAR JID DE WHATSAPP ---
function formatJid(phone) {
    if (!phone) return null;
    let clean = phone.toString().replace(/\D/g, '');

    // Si el número tiene 10 dígitos (México), le ponemos el prefijo 521
    if (clean.length === 10) {
        clean = '521' + clean;
    }
    // Si ya tiene prefijo 52 pero no el 1 (común en JIDs de Baileys), lo intentamos normalizar
    else if (clean.startsWith('52') && clean.length === 12) {
        clean = '521' + clean.substring(2);
    }

    return `${clean}@s.whatsapp.net`;
}

// --- MONITOR DE CAMBIOS DE ESTADO EN PEDIDOS (MODO ELITE) ---
onValue(ref(db, "orders"), (snapshot) => {
    if (!snapshot.exists() || !global.botSocket) return;

    snapshot.forEach((child) => {
        const orderId = child.key;
        const order = child.val();

        // No notificar si está en PENDIENTE o si no tiene número
        if (!order.status || order.status === "PENDIENTE" || !order.phone) return;

        // VERSIÓN 7 - FORZANDO RE-ENVÍO ELITE
        const cacheKey = `notif_v7_force_${orderId}_${order.status}`;
        if (!global.statusNotifCache) global.statusNotifCache = new Set();

        if (!global.statusNotifCache.has(cacheKey)) {
            global.statusNotifCache.add(cacheKey);

            const jid = formatJid(order.phone);
            logToWeb('SISTEMA', 'LOGÍSTICA', `FORZANDO ENVÍO PRO: ${order.username} (${order.status}) JID: ${jid}`);

            const statusEmoji = {
                "EN PROCESO": "⚙️",
                "ENVIADO": "🚚",
                "ENTREGADO": "🎁",
                "CANCELADO": "❌"
            }[order.status.toUpperCase()] || "📋";

            const statusMsg = `🐺 *LOBO STORE - ACTUALIZACIÓN ELITE* 🐺\n\n` +
                              `¡Hola *${order.username.toUpperCase()}*! 🚀\n\n` +
                              `Tu pedido ha sido actualizado en nuestro centro logístico:\n\n` +
                              `📦 *ARTÍCULO:* ${order.name || 'Premium Item'}\n` +
                              `🆔 *ORDEN:* #${orderId.slice(-6).toUpperCase()}\n` +
                              `${statusEmoji} *ESTADO:* 【 ${order.status.toUpperCase()} 】\n\n` +
                              `━━━━━━━━━━━━━━━━━━━\n` +
                              `✨ *Mensaje:* Estamos trabajando para que tu tecnología llegue lo antes posible.\n\n` +
                              `🔗 *Rastreo en vivo:* https://producto-enventa-63d4e.firebaseapp.com/\n\n` +
                              `¡Gracias por tu preferencia! 🐺✨`;

            const imgUrl = order.img || order.imageUrl;

            const sendUpdate = async () => {
                try {
                    if (imgUrl && imgUrl.startsWith('http')) {
                        await global.botSocket.sendMessage(jid, { image: { url: imgUrl }, caption: statusMsg });
                    } else {
                        await global.botSocket.sendMessage(jid, { text: statusMsg });
                    }
                    logToWeb('SISTEMA', 'ÉXITO', `✅ Status "${order.status}" enviado a ${order.username}`);
                } catch (err) {
                    console.error(`❌ [ELITE] Error enviando a ${jid}:`, err);
                    logToWeb('SISTEMA', 'ERROR', `Fallo al enviar a ${order.username}. JID: ${jid}`);
                }
            };

            setTimeout(sendUpdate, 2000);
        }
    });
});

// --- CEREBRO DE LA IA AUTÓNOMA ---
async function askAI(prompt, history = [], inventory = "", userName = "Cliente") {
    try {
        const fullPrompt = `Eres el Asistente Virtual de "VENTAS LOBO STORE". Tu objetivo es asesorar, vender y cerrar pedidos de forma profesional.
        Usa emojis de lobo 🐺 y tecnología 🚀.

        USUARIO ACTUAL: ${userName}

        INVENTARIO REAL DISPONIBLE:
        ${inventory}

        FLUJO DE VENTA:
        1. Si el cliente pregunta por productos, recomiéndale los que tenemos en stock.
        2. Si el cliente dice que quiere COMPRAR o ADQUIRIR un producto:
           - Pregúntale amablemente su *Nombre Completo* y su *Teléfono de contacto*.
           - Explícale que una vez que de sus datos, el administrador lo contactará para el pago.
           - También puedes darle este link para que lo haga más rápido él mismo: https://producto-enventa-63d4e.firebaseapp.com/
        3. Si un producto no está en la lista de arriba, dile que está AGOTADO momentáneamente.
        4. Si el cliente da sus datos (Nombre y Teléfono), confírmale que has registrado su interés y que pronto le hablaremos.

        REGLAS:
        - Responde de forma natural, no parezcas un robot de opciones.
        - Sé persuasivo pero educado.

        Pregunta del cliente: ${prompt}`;

        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
    } catch (e) {
        console.error("Error en IA:", e);
        return "🐺 ¡Hola! Estamos teniendo una alta demanda. ¿En qué puedo ayudarte? Puedes ver nuestro catálogo aquí: https://producto-enventa-63d4e.firebaseapp.com/";
    }
}

// --- MONITOR DE COMANDOS REMOTOS ---
onValue(ref(db, "bot_control/command"), async (snapshot) => {
    const cmd = snapshot.val();
    if (cmd && cmd.action === "LOGOUT") {
        console.log('\n🚨 ORDEN DE CIERRE RECIBIDA...');
        await set(ref(db, "bot_control/command"), null);
        if (fs.existsSync(SESSION_PATH)) fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        process.exit(0);
    }
});

// --- SERVIDOR WEB DE CONTROL ---
const app_web = express();
const port = process.env.PORT || 3000;
let currentQR = null;
app_web.get('/', (req, res) => {
    if (currentQR) {
        QRCode.toDataURL(currentQR, (err, url) => {
            res.send(`<html><body style="background:#000;color:#00F2FF;text-align:center;padding:50px;"><img src="${LOGO_OFFICIAL}" style="width:120px;"><br><h1>QR LOBO STORE</h1><img src="${url}"><p>Escanea para activar.</p></body></html>`);
        });
    } else { res.send('<h1>🐺 Lobo Store Online 🚀</h1>'); }
});

// --- MOTOR DEL BOT ---
async function startProfessionalBot() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();

    console.log('\n[SISTEMA] Iniciando Lobo Store Pro...');

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Lobo Store Pro', 'Safari', '3.0'],
        msgRetryCounterCache,
        syncFullHistory: false,
        getMessage: async (key) => {
            // Esto ayuda a resolver el error de "Esperando mensaje"
            // permitiendo que el bot reintente el descifrado
            return {
                conversation: 'Resyncing...'
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            currentQR = qr;
            qrcodeTerminal.generate(qr, { small: true });
            logToWeb('SISTEMA', 'WHATSAPP', 'Nuevo código QR generado');
        }
        if (connection === 'close') {
            currentQR = null;
            global.botSocket = null;
            const reason = lastDisconnect?.error?.output?.statusCode;
            logToWeb('SISTEMA', 'CONEXIÓN', `Desconectado (Razón: ${reason})`);
            if ((lastDisconnect.error instanceof Boom) && reason !== DisconnectReason.loggedOut) startProfessionalBot();
        } else if (connection === 'open') {
            currentQR = null;
            global.botSocket = sock;
            logToWeb('SISTEMA', 'CONEXIÓN', '✅ Bot conectado exitosamente');
            console.log('✅ BOT CONECTADO 🐺🚀');
            checkStockAlerts(); // Verificar stock al conectar
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify' || !botEnabled) return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const userWAID = jidNormalizedUser(from).split('@')[0];
        const pushName = msg.pushName || 'Cliente';
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const lowerText = text.toLowerCase();
        const time = new Date().toLocaleTimeString();

        console.log(`[${time}] 📩 ${pushName} (${userWAID}): ${text}`);
        logToWeb('CHAT', pushName, text);

        // --- GUARDAR HISTORIAL ---
        try {
            await push(ref(db, 'messages_history'), {
                name: pushName,
                number: userWAID,
                message: text,
                timestamp: Date.now()
            });
        } catch (e) {}

        // --- SINCRONIZACIÓN DE USUARIO ---
        const userRef = ref(db, `bot_users/${userWAID}`);
        let userData = {};
        try {
            const snap = await get(userRef);
            if (snap.exists()) {
                userData = snap.val();
                // SI EL USUARIO ESTÁ BLOQUEADO, NO HACER NADA
                if (userData.status === "blocked") {
                    console.log(`[BLOQUEADO] Ignorando mensaje de ${userWAID}`);
                    return;
                }
            }
        } catch (e) {}

        const displayName = userData.name || pushName;
        update(userRef, { whatsapp_name: pushName, last_seen: Date.now() });

        const sendLobo = async (jid, caption) => {
            try { await sock.sendMessage(jid, { image: { url: LOGO_OFFICIAL }, caption }); }
            catch (e) { await sock.sendMessage(jid, { text: caption }); }
        };

        // --- FLUJO IA AUTÓNOMA ---
        if (sessions[from] === 'waiting_data') {
            delete sessions[from];
            const detectedNum = text.replace(/\D/g, '');
            const finalNum = detectedNum.length >= 10 ? detectedNum : (userData.number || userWAID);

            const confirmationMsg = `✅ ¡Recibido! He guardado tu número: *${finalNum}*. El administrador te contactará pronto. 🐺`;
            await sock.sendMessage(from, { text: confirmationMsg });
            logToWeb('SISTEMA', 'BOT', `Contacto guardado: ${finalNum}`);

            const aviso = `🐺 *NUEVA SOLICITUD*\n👤: ${pushName}\n🆔: ${userData.name || 'Sin asignar'}\n📱: ${finalNum}\n🌍: ${userWAID}\n💬: "${text}"\n🔗: wa.me/${finalNum.toString().replace(/\D/g,'')}`;
            await sock.sendMessage(ADMIN_JID, { text: aviso });

            try {
                await push(ref(db, 'talk_requests'), { name: displayName, number: finalNum, whatsapp_id: userWAID, timestamp: Date.now() });
                if(detectedNum.length >= 10) await update(userRef, { number: detectedNum, phone: detectedNum });
            } catch (e) {}
            return;
        }

        // COMANDO MANUAL PARA ADMIN
        if (lowerText === 'hablar con admin' || lowerText === '4') {
            sessions[from] = 'waiting_data';
            await sock.sendMessage(from, { text: `👨‍💼 *CONTACTO PERSONALIZADO*\n\nPor favor, escribe tu *Nombre* y tu *Teléfono* para que el administrador te llame.` });
            return;
        }

        // COMANDO PARA PEDIR TICKET / RASTREO
        if (lowerText.includes('ticket') || lowerText.includes('mi pedido') || lowerText.includes('rastrear')) {
            try {
                const ordersSnap = await get(ref(db, 'orders'));
                let lastOrder = null;

                if (ordersSnap.exists()) {
                    ordersSnap.forEach(child => {
                        const o = child.val();
                        const oPhone = o.phone.toString().replace(/\D/g, '');
                        if (oPhone.includes(userWAID) || userWAID.includes(oPhone)) {
                            if (!lastOrder || o.timestamp > lastOrder.timestamp) {
                                lastOrder = { ...o, id: child.key };
                            }
                        }
                    });
                }

                if (lastOrder) {
                    const ticketMsg = `🐺 *LOBO STORE - TU TICKET DIGITAL* 🐺\n` +
                                      `━━━━━━━━━━━━━━━━━━━\n` +
                                      `🆔 *ORDEN:* #${lastOrder.id.slice(-6).toUpperCase()}\n` +
                                      `👤 *CLIENTE:* ${lastOrder.username.toUpperCase()}\n` +
                                      `📦 *ARTÍCULO:* ${lastOrder.name.toUpperCase()}\n` +
                                      `💰 *VALOR:* $${lastOrder.price}\n` +
                                      `📅 *FECHA:* ${new Date(lastOrder.timestamp).toLocaleDateString()}\n` +
                                      `💎 *ESTADO:* 【 ${lastOrder.status || 'PENDIENTE'} 】\n` +
                                      `━━━━━━━━━━━━━━━━━━━\n` +
                                      `🔗 *Rastreo Web:* https://producto-enventa-63d4e.firebaseapp.com/\n\n` +
                                      `✨ _Gracias por tu confianza._ 🐺`;

                    const imgUrl = lastOrder.img || lastOrder.imageUrl;
                    if (imgUrl && imgUrl.startsWith('http')) {
                        await sock.sendMessage(from, { image: { url: imgUrl }, caption: ticketMsg });
                    } else {
                        await sock.sendMessage(from, { text: ticketMsg });
                    }
                    logToWeb('CHAT', 'SISTEMA', `Ticket enviado a petición de ${pushName}`);
                    return;
                } else {
                    await sock.sendMessage(from, { text: `🐺 Lo siento, *${pushName}*, no encontré pedidos recientes vinculados a este número.\n\nPuedes intentar rastrearlo manualmente aquí: https://producto-enventa-63d4e.firebaseapp.com/` });
                    return;
                }
            } catch (e) {
                console.error("Error al buscar ticket:", e);
            }
        }

        // DETECTAR PEDIDO DE LA WEB (MODO PREMIUM)
        if (text.includes('NUEVO PEDIDO - LOBO STORE')) {
            const lines = text.split('\n');

            // Extracción Limpia (Premium Parsing)
            const cleanExtract = (key) => {
                const line = lines.find(l => l.toLowerCase().includes(key.toLowerCase()));
                return line ? line.split(':')[1]?.replace(/\*/g, '').trim() : null;
            };

            const cliente = cleanExtract('Cliente') || pushName;
            const phoneProvided = cleanExtract('WhatsApp') || userWAID;
            const producto = cleanExtract('Producto') || 'Producto Desconocido';
            const precio = cleanExtract('Precio') || 'Consultar';

            // Buscar Imagen del Producto para el Admin
            let pedidoImagen = null;
            try {
                const pSnap = await get(ref(db, 'products'));
                if (pSnap.exists()) {
                    pSnap.forEach(c => {
                        const p = c.val();
                        if (producto.toLowerCase().includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(producto.toLowerCase())) {
                            pedidoImagen = p.imageUrl;
                        }
                    });
                }
            } catch (e) {}

            const adminAlert = `🐺 *LOBO STORE - MODO PREMIUM* 🐺\n\n` +
                               `🚀 *¡NUEVA VENTA DETECTADA!* 🚀\n` +
                               `━━━━━━━━━━━━━━━━━━\n` +
                               `👤 *CLIENTE:* ${cliente.toUpperCase()}\n` +
                               `📱 *WHATSAPP:* ${phoneProvided}\n` +
                               `📦 *PRODUCTO:* ${producto}\n` +
                               `💰 *VALOR:* ${precio}\n` +
                               `━━━━━━━━━━━━━━━━━━\n` +
                               `🔗 *CHAT DIRECTO:* wa.me/${phoneProvided.replace(/\D/g,'')}\n\n` +
                               `🔥 *Acción:* Contacta al cliente de inmediato para cerrar la venta.`;

            // Enviar al Admin con foto si existe
            if (pedidoImagen && pedidoImagen.startsWith('http')) {
                await sock.sendMessage(ADMIN_JID, { image: { url: pedidoImagen }, caption: adminAlert });
            } else {
                await sock.sendMessage(ADMIN_JID, { text: adminAlert });
            }

            // Confirmación al Cliente (Modo Elite con Ticket)
            const ticketId = `#${Date.now().toString().slice(-6)}`;
            const clientConfirm = `🐺 *LOBO STORE - TICKET DIGITAL* 🐺\n` +
                                  `━━━━━━━━━━━━━━━━━━━\n` +
                                  `🚀 *PEDIDO CONFIRMADO*\n\n` +
                                  `👤 *CLIENTE:* ${cliente.toUpperCase()}\n` +
                                  `📦 *ARTÍCULO:* ${producto.toUpperCase()}\n` +
                                  `💰 *VALOR:* ${precio}\n` +
                                  `🆔 *TICKET:* ${ticketId}\n\n` +
                                  `💎 *ESTADO:* 【 PROCESANDO 】\n` +
                                  `━━━━━━━━━━━━━━━━━━━\n` +
                                  `✨ *Siguiente Paso:* Un asesor validará tu orden en minutos.\n\n` +
                                  `🔗 *Rastreo Online:* https://producto-enventa-63d4e.firebaseapp.com/\n\n` +
                                  `¡Gracias por elegir Lobo Store! 🐺✨`;

            if (pedidoImagen && pedidoImagen.startsWith('http')) {
                await sock.sendMessage(from, { image: { url: pedidoImagen }, caption: clientConfirm });
            } else {
                await sock.sendMessage(from, { text: clientConfirm });
            }
            logToWeb('CHAT', 'SISTEMA', `Ticket Digital generado: ${ticketId}`);
            return;
        }

        // RESPUESTA CON IA
        try {
            // 1. Obtener inventario para la IA y buscar imagen relevante
            const pSnap = await get(ref(db, 'products'));
            let inventoryStr = "";
            let bestMatchImage = null;

            if (pSnap.exists()) {
                pSnap.forEach(c => {
                    const p = c.val();
                    if (parseInt(p.stock) > 0) {
                        inventoryStr += `- ${p.name}: $${p.price} (${p.description})\n`;

                        // Si el cliente menciona el nombre del producto, guardamos su imagen
                        if (lowerText.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(lowerText)) {
                            if (p.imageUrl && p.imageUrl.startsWith('http')) {
                                bestMatchImage = p.imageUrl;
                            }
                        }
                    }
                });
            }

            // 2. Generar respuesta autónoma
            const aiResponse = await askAI(text, [], inventoryStr, displayName);

            // 3. Enviar respuesta (con imagen si se detectó una)
            if (bestMatchImage) {
                await sock.sendMessage(from, {
                    image: { url: bestMatchImage },
                    caption: aiResponse
                });
            } else {
                await sock.sendMessage(from, { text: aiResponse });
            }

            logToWeb('IA', 'BOT', aiResponse);

        } catch (e) {
            console.log("Error en flujo IA:", e);
            const fallback = `🐺 ¡Hola! Soy el asistente de Lobo Store. Visita nuestro catálogo real aquí: https://producto-enventa-63d4e.firebaseapp.com/`;
            await sock.sendMessage(from, { text: fallback });
            logToWeb('SISTEMA', 'ERROR', 'Fallo en motor IA');
        }
    });
}

app_web.listen(port, () => {
    startProfessionalBot().catch(e => console.error(e));
    logToWeb('SISTEMA', 'CORE', 'Servidor de control iniciado');
});
