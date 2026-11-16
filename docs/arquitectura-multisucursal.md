# LOBO STORE Matrix: varias sucursales

## Qué incluye esta implementación

- El catálogo web y el panel trabajan bajo `stores/{storeId}`; el catálogo permite compartir una sucursal con `?sucursal=lobo-centro`.
- El panel de administración inicia sesión con Firebase Authentication y solo ofrece las sucursales asociadas a la membresía de la cuenta. La cuenta inicial owner puede crear/pausar sucursales y asignar/revocar personal por UID.
- Los pedidos web y Android se asocian a una sesión anónima de Firebase; el cliente solo puede consultar sus propios pedidos. El personal puede consultar y actualizar los pedidos de sus sucursales.
- Android permite elegir la sucursal del catálogo; la app usa `MATRIX_STORE_ID` como sucursal inicial.
- El bot recibe `STORE_ID`, inicia sesión con una cuenta de personal y utiliza la misma ruta de datos de esa sucursal. El identificador puede pasarse como variable de entorno o en `config.json`.
- Las reglas de Realtime Database están en `database.rules.json` y se referencian desde `firebase.json`. La migración inicial conserva los nodos globales antiguos.

## Estructura de datos

```text
store_directory/{storeId}                 # nombre y estado visible del catálogo
stores/{storeId}/profile                  # nombre, moneda, zona horaria y estado
stores/{storeId}/products                 # catálogo e inventario
stores/{storeId}/orders                   # pedidos, protegidos por customerUid
stores/{storeId}/talk_requests            # solicitudes de atención
stores/{storeId}/bot_users                # usuarios atendidos por el bot
stores/{storeId}/bot_logs                 # historial del bot
stores/{storeId}/messages_history         # historial de mensajes
stores/{storeId}/bot_control              # configuración y comandos del bot
stores/{storeId}/settings                 # ajustes de sucursal
stores/{storeId}/activity                 # eventos de auditoría reservados al backend
memberships/{uid}/{storeId}               # rol y estado del acceso
```

Los roles admitidos son `owner`, `manager` y `staff`. Las cuentas de clientes usan Firebase Anonymous Authentication; las cuentas del panel y del bot deben usar Email/Password. No compartas credenciales entre sucursales: asigna una membresía explícita por sucursal.

## Configurar Firebase antes de desplegar

1. En Firebase Authentication habilita **Email/Password** y **Anonymous**. Crea una cuenta administrativa individual para cada persona.
2. Crea `config.json` local a partir de `config.example.json`. Completa `FIREBASE_API_KEY`, `FIREBASE_EMAIL`, `FIREBASE_PASSWORD`, `GEMINI_API_KEY`, `ADMIN_JID` y `STORE_ID`. No subas ese archivo al repositorio.
3. Con las reglas anteriores aún activas, simula la migración inicial: `node scripts/migrate-matrix.js`. El destino predeterminado es `lobo-centro`. Revisa el plan antes de ejecutar `node scripts/migrate-matrix.js --apply`. La operación exige que las rutas destino estén vacías y copia los datos sin borrar los nodos globales originales.
4. Crea una membresía `owner` para la cuenta de administración. El script asigna como owner a la cuenta autenticada al migrar. Añade las otras cuentas a `memberships/{uid}/{storeId}` desde una consola confiable. No permitas que el cliente escriba membresías.
5. Revisa las reglas de `database.rules.json`, ejecuta pruebas manuales en Firebase Emulator Suite con dos sucursales y dos cuentas, y después despliega con `firebase deploy --only database,hosting`.
6. Para crear sucursales y asignar personal, usa los controles de plataforma del panel: primero crea la cuenta Email/Password en Firebase Authentication y copia su UID; luego asigna el UID y el rol a la sucursal. Configura cada bot con su propio `STORE_ID`, correo de servicio, WhatsApp y carpeta de sesión.

## Límites de la migración

Los datos originales permanecen en la raíz para rollback. Los pedidos históricos no incluyen `customerUid`, por lo que quedan disponibles para el personal pero no aparecen en el rastreo privado del cliente. Los nuevos pedidos sí quedan ligados a la sesión de quien los creó. La sesión de WhatsApp Baileys también debe mantenerse separada por proceso/sucursal; no ejecutes dos procesos que compartan la misma carpeta `auth_info_baileys`.

El código no publica automáticamente la tienda ni despliega reglas. Primero configura Authentication y migra los datos; luego prueba permisos y publica la rama revisada.
