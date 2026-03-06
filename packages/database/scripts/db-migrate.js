#!/usr/bin/env node
const { config } = require('dotenv');
const { resolve } = require('path');
const { execSync } = require('child_process');

// Cargar .env desde múltiples ubicaciones
config({ path: resolve(__dirname, '../.env') });
config({ path: resolve(__dirname, '../prisma/.env') });
config({ path: resolve(__dirname, '../../../.env') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ ERROR: DATABASE_URL no está definida en ningún archivo .env');
  console.error('Por favor, crea un archivo .env con DATABASE_URL o configura la variable de entorno.');
  process.exit(1);
}

// Obtener el nombre de la migración desde los argumentos
const migrationName = process.argv.slice(2).find(arg => arg.startsWith('--name='))?.split('=')[1];
const args = migrationName ? `--name ${migrationName}` : '';

console.log(`✓ Usando DATABASE_URL: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`);

try {
  execSync(`prisma migrate dev --url "${dbUrl}" ${args}`, { 
    stdio: 'inherit',
    cwd: resolve(__dirname, '..')
  });
} catch (error) {
  process.exit(error.status || 1);
}
