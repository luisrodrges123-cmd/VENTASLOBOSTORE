const AIRPODS_IMG = 'https://i.postimg.cc/28Fd2m6L/Chat-GPT-Image-6-jun-2026-05-13-46-p-m.png';
const CARGADOR_IMG = 'https://i.postimg.cc/d0WZR7NK/Chat-GPT-Image-7-jun-2026-12-06-25-p-m.png';

sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];

  if (!msg.message || msg.key.fromMe) return;

  const from = msg.key.remoteJid;

  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    '';

  const mensaje = text.toLowerCase().trim();

  if (
    mensaje === 'hola' ||
    mensaje === 'menu' ||
    mensaje === 'menú'
  ) {
    await sock.sendMessage(from, {
      text: `🐺 *LOBO STORE*

¡Bienvenido!

1️⃣ AirPods Pro
2️⃣ Cargador iPhone 20W
3️⃣ Horarios
4️⃣ Hablar con asesor

Responde con el número de la opción.`
    });
  }

  if (mensaje === '1' || mensaje.includes('airpods')) {
    await sock.sendMessage(from, {
      image: { url: AIRPODS_IMG },
      caption: `🎧 *AirPods Pro*

✅ Cancelación de ruido
✅ Audio espacial
✅ Estuche MagSafe
✅ Sonido premium

📝 Si deseas comprar, responde:

REGISTRAR`
    });
  }

  if (mensaje === '2' || mensaje.includes('cargador')) {
    await sock.sendMessage(from, {
      image: { url: CARGADOR_IMG },
      caption: `⚡ *Cargador iPhone 20W*

✅ Carga rápida
✅ Cable USB-C a Lightning
✅ Alta calidad

📝 Si deseas comprar, responde:

REGISTRAR`
    });
  }

  if (mensaje === 'registrar') {
    await sock.sendMessage(from, {
      text: `📝 *Registro de Cliente*

Por favor envía:

Nombre completo:
Ciudad:

Ejemplo:
Juan Pérez
Los Mochis`
    });
  }

  if (mensaje === '3') {
    await sock.sendMessage(from, {
      text: `🕒 *Horario de Atención*

Lunes a Sábado
9:00 AM a 7:00 PM`
    });
  }

  if (mensaje === '4') {
    await sock.sendMessage(from, {
      text: `👨‍💼 Un asesor te atenderá en breve.

Gracias por contactar a LOBO STORE 🐺`
    });
  }
});