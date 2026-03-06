# Database Scripts

Scripts wrapper para comandos de Prisma que cargan automáticamente `DATABASE_URL` desde archivos `.env`.

## Scripts Disponibles

### `db-push.js`
Sincroniza el schema de Prisma con la base de datos sin crear migraciones.
Útil para desarrollo rápido.

```bash
node scripts/db-push.js
# O desde raíz: pnpm db:push
```

### `db-migrate.js`
Crea una nueva migración basada en cambios del schema y la aplica a la base de datos.

```bash
node scripts/db-migrate.js --name=add_new_field
# O desde raíz: pnpm db:migrate --name=add_new_field
```

### `db-studio.js`
Inicia Prisma Studio, una UI visual para explorar y editar datos de la base de datos.

```bash
node scripts/db-studio.js
# O desde raíz: pnpm db:studio
```

## ¿Por qué necesitamos estos scripts?

Estos scripts wrapper facilitan el trabajo con Prisma al:

1. Cargan `DATABASE_URL` desde múltiples ubicaciones `.env`
2. Validan que la variable existe
3. Ejecutan el comando de Prisma con el flag `--url`
4. Muestran mensajes de error claros si falta configuración

## Ubicaciones de búsqueda de .env

Los scripts buscan archivos `.env` en este orden:

1. `packages/database/.env`
2. `packages/database/prisma/.env`
3. `.env` (raíz del proyecto)

También respetan variables de entorno del sistema (`process.env.DATABASE_URL`).

## Nota sobre Producción

En producción/Docker, el comando `prisma migrate deploy` **SÍ lee variables de entorno directamente**, así que no necesita un script wrapper. Solo los comandos de desarrollo requieren estos scripts.

Ver [../../docs/PRISMA_CONFIG.md](../../docs/PRISMA_CONFIG.md) para más información sobre la configuración de Prisma.
