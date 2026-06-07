// 🐺 BOT LOBO STORE - DINÁMICO CON FIREBASE
const LOGO_LOBO = 'https://storage.googleapis.com/static.smart-chat.ai/v1/user-images/f77b9468-d064-4e35-a1c6-29177114b01d/20250212015037_12.jpg';

/*
  NOTA: Para que este bot sea dinámico, se requiere instalar firebase-admin:
  npm install firebase-admin
*/

// Simulación de conexión a Firebase (Configura tus credenciales aquí)
// const admin = require('firebase-admin');
// const db = admin.database();

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

Para ver nuestra tienda online entra aquí:
https://producto-enventa-63d4e.firebaseapp.com/

Responde con el número de tu opción.`
    });
  }

  // --- OPCIÓN 1: CATÁLOGO (Ejemplo dinámico) ---
  if (mensaje === '1' || mensaje.includes('catálogo')) {
    // Aquí podrías hacer: const products = (await db.ref('products').once('value')).val();
    await sock.sendMessage(from, {
      text: `🚀 *NUESTRO CATÁLOGO ACTUAL* 🚀

Tenemos lo mejor en tecnología:
✅ AirPods Pro (Cancelación de ruido)
✅ Cargadores iPhone 20W (Carga Rápida)
✅ Y mucho más...

*¿Quieres ver un producto en específico?*
Responde con el nombre del producto o visita nuestra web.`
    });
  }

  // --- REGISTRO ---
  if (mensaje === 'registrar' || mensaje === 'comprar') {
    await sock.sendMessage(from, {
      text: `📝 *PROCESO DE PEDIDO*

Para agendar tu pedido, por favor envíanos:
1. *Nombre Completo:*
2. *Producto de interés:*
3. *Ciudad:*

En breve un asesor confirmará tu pedido. 🐺`
    });
  }

  // --- HORARIOS ---
  if (mensaje === '3') {
    await sock.sendMessage(from, {
      text: `🕒 *HORARIOS DE ATENCIÓN*

📍 *Ubicación:* Los Mochis, Sinaloa.
📅 *Lunes a Sábado:* 9:00 AM - 7:00 PM
🚀 *Entregas:* Inmediatas en punto medio o a domicilio.`
    });
  }

  // --- ASESOR ---
  if (mensaje === '4' || mensaje.includes('asesor')) {
    await sock.sendMessage(from, {
      text: `👨‍💼 *Conectando con Asesor...*

He avisado al equipo de *LOBO STORE*. Te responderemos en unos minutos. ¡Gracias por tu paciencia! 🐺`
    });
  }
});
