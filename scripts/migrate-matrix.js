const fs = require('node:fs');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, get, update } = require('firebase/database');

const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const storeId = (process.env.STORE_ID || config.STORE_ID || 'lobo-centro').toLowerCase();
if (!/^[a-z0-9-]{2,40}$/.test(storeId)) throw new Error('STORE_ID inválido');
if (!config.FIREBASE_API_KEY || !config.FIREBASE_EMAIL || !config.FIREBASE_PASSWORD) {
  throw new Error('Faltan FIREBASE_API_KEY, FIREBASE_EMAIL o FIREBASE_PASSWORD en config.json');
}
const app = initializeApp({
  apiKey: config.FIREBASE_API_KEY,
  authDomain: 'producto-enventa.firebaseapp.com',
  databaseURL: 'https://producto-enventa-default-rtdb.firebaseio.com',
  projectId: 'producto-enventa'
}, 'matrix-migration');
const auth = getAuth(app);
const db = getDatabase(app);
const collections = ['products', 'orders', 'talk_requests', 'bot_users', 'bot_logs', 'messages_history', 'bot_control'];

async function migrate() {
  const credential = await signInWithEmailAndPassword(auth, config.FIREBASE_EMAIL, config.FIREBASE_PASSWORD);
  const uid = credential.user.uid;
  const paths = [`stores/${storeId}/profile`, `store_directory/${storeId}`, `memberships/${uid}/${storeId}`,
    ...collections.map(name => `stores/${storeId}/${name}`)];
  const snapshots = await Promise.all(paths.map(path => get(ref(db, path))));
  const existing = paths.filter((_, index) => snapshots[index].exists() && index >= 3);
  if (existing.length) throw new Error(`Ya existen datos en la sucursal destino (${existing.join(', ')}). No se modificó nada.`);
  const legacy = await Promise.all(collections.map(name => get(ref(db, name))));
  const updates = {
    [`stores/${storeId}/profile`]: { name: config.STORE_NAME || 'Lobo Store - Centro', slug: storeId, active: true, currency: 'MXN', timezone: 'America/Chihuahua' },
    [`store_directory/${storeId}`]: { name: config.STORE_NAME || 'Lobo Store - Centro', active: true },
    [`memberships/${uid}/${storeId}`]: { role: 'owner', active: true },
    [`platform_admins/${uid}`]: true
  };
  collections.forEach((name, index) => { if (legacy[index].exists()) updates[`stores/${storeId}/${name}`] = legacy[index].val(); });
  if (!process.argv.includes('--apply')) {
    console.log(`Simulación lista para ${storeId}: ${Object.keys(updates).length} rutas; los datos globales se conservarán.`);
    console.log('Revisa config.json y vuelve a ejecutar con --apply para escribir la sucursal y asignar owner al usuario autenticado.');
    process.exit(0);
  }
  await update(ref(db), updates);
  console.log(`Migración completada para ${storeId}. Los datos originales se conservaron para rollback.`);
}

migrate().catch(error => { console.error(error.message); process.exitCode = 1; });
