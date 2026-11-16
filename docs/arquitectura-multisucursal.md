# Arquitectura para varias sucursales

## Objetivo

Una sola plataforma administra varias sucursales. Cada pedido, producto, mensaje y ajuste pertenece a un `storeId`; los datos de una sucursal no quedan visibles para el personal de otra. El propietario puede tener acceso a varias sucursales y cambiar la sucursal activa desde el panel.

## Modelo de datos propuesto (Firebase Realtime Database)

```text
stores/
  {storeId}/
    profile/       # nombre, slug, active, timezone, currency, contact
    products/      # catálogo e inventario exclusivos de la sucursal
    orders/        # pedidos exclusivos
    talk_requests/ # solicitudes de atención
    settings/      # WhatsApp, bot y preferencias de sucursal
    activity/      # eventos de auditoría escritos por backend
memberships/
  {uid}/
    {storeId}/     # { role: owner|manager|staff, active: true }
```

Usa identificadores estables en minúsculas, por ejemplo `chihuahua-centro`. No uses el nombre mostrado como identificador.

## Roles

- **owner**: administra sucursales, personal y configuración.
- **manager**: administra catálogo, inventario, pedidos y solicitudes de las sucursales asignadas.
- **staff**: consulta y atiende pedidos de las sucursales asignadas.

Los permisos deben derivarse de Firebase Authentication y de `memberships/{uid}/{storeId}`. El cliente no debe poder darse permisos ni editar su propia membresía. La asignación y revocación de acceso se hace desde un backend confiable con Firebase Admin SDK.

## Reglas de acceso

`database.rules.multitenant.json` es un borrador para esta estructura. Mantiene bloqueadas las rutas globales y deja la creación y modificación de pedidos a un backend confiable. Las reglas **no están conectadas a firebase.json** y no se deben desplegar hasta migrar y verificar web, Android y bot: hoy usan rutas globales como `products`, `orders` y `bot_users`, y el panel web accede sin autenticación.

Antes de activarlas:

1. Configura Firebase Authentication para el personal y crea membresías desde un backend confiable.
2. Cambia tienda web, panel, app Android y bot para recibir un `storeId` explícito y usar solo `stores/{storeId}/...`.
3. Migra los registros existentes a una sucursal inicial, conservando una copia de respaldo y los IDs.
4. Prueba acceso permitido y denegado en Firebase Local Emulator Suite, incluyendo dos sucursales y dos cuentas.
5. Despliega reglas en una ventana controlada y verifica creación de pedidos, inventario y mensajes.

## Funciones que habilita esta base

- Selector de sucursal según membresías del usuario.
- Inventario independiente por sucursal.
- Pedidos y solicitudes filtrados por sucursal.
- Configuración de WhatsApp y bot por sucursal.
- Registro de auditoría centralizado por sucursal.
- Reportes consolidados para el propietario, mediante consultas autorizadas en backend.

## Estado

Este cambio incorpora la propuesta de datos y un borrador de reglas. No migra los clientes ni los datos existentes, no activa reglas y no publica cambios en Firebase Hosting. La activación requiere completar los pasos anteriores para no interrumpir la tienda actual.
