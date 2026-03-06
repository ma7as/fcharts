# GitHub Copilot Configuration

Este directorio contiene configuraciones e instrucciones para GitHub Copilot en diferentes IDEs.

## Archivos Disponibles

### 📄 [`copilot-instructions.md`](./copilot-instructions.md)
Instrucciones principales para GitHub Copilot en **VS Code**. Este archivo es detectado automáticamente por GitHub Copilot.

**Contenido**:
- Stack tecnológico completo
- Directrices de código para Frontend (Next.js) y Backend (NestJS)
- Guías de uso de Prisma 5.22.0
- Patrones de diseño recomendados
- Convenciones de nombres
- Ejemplos de código

### 📄 [`webstorm-copilot-guide.md`](./webstorm-copilot-guide.md)
Guía completa para configurar y usar GitHub Copilot en **WebStorm**.

**Contenido**:
- Instrucciones de instalación y configuración
- Configuración de TypeScript, Node.js y pnpm
- Configuración de base de datos
- Atajos de teclado útiles
- Debugging en WebStorm
- Mismas directrices de código que VS Code

## Cómo Usar

### VS Code

1. **GitHub Copilot detecta automáticamente** el archivo `copilot-instructions.md`
2. No se requiere configuración adicional
3. Copilot seguirá las directrices al generar código

**Verificar que funciona**:
- Abre cualquier archivo `.ts` o `.tsx`
- Copilot sugerirá código según las directrices
- Ejemplo: Al crear un componente React, sugerirá Server Components por defecto

### WebStorm

1. **Instalar GitHub Copilot**:
   - Settings → Plugins → Buscar "GitHub Copilot"
   - Instalar y reiniciar
   
2. **Login**:
   - Tools → GitHub Copilot → Login to GitHub

3. **Configuración adicional**:
   - Seguir las instrucciones en [`webstorm-copilot-guide.md`](./webstorm-copilot-guide.md)

**Nota**: WebStorm no detecta automáticamente archivos de instrucciones como VS Code. Las directrices funcionan a través del contexto del proyecto.

## Stack Tecnológico (Resumen)

```
Frontend:  Next.js 15.3.2 + React 19 + TailwindCSS 4.0
Backend:   NestJS 11 + PostgreSQL 16 + Prisma 5.22.0
Cache:     Redis 7
Realtime:  Socket.io
Auth:      JWT + bcrypt
Monorepo:  pnpm workspaces
```

## Versiones Importantes

⚠️ **Prisma 5.22.0**: Este proyecto usa Prisma 5, NO Prisma 7
- Prisma 7 tiene cambios importantes que requieren configuración especial
- Prisma 5 es más estable y simple para este proyecto

📦 **Node.js 20+**: Requerido para Next.js 15 y NestJS 11

🔧 **pnpm**: Gestor de paquetes del proyecto (NO usar npm o yarn)

## Comandos Rápidos

```bash
# Setup inicial
pnpm install
docker-compose up -d
pnpm db:generate
pnpm db:push
pnpm db:seed

# Desarrollo
pnpm dev              # Todo
pnpm dev:frontend     # Solo frontend
pnpm dev:backend      # Solo backend

# Base de datos
pnpm db:studio        # GUI para ver datos
```

## Recursos

- **Documentación Principal**: [`../README.md`](../README.md)
- **Guía de Inicio**: [`../GETTING_STARTED.md`](../GETTING_STARTED.md)
- **Configuración de Prisma**: [`../docs/PRISMA_CONFIG.md`](../docs/PRISMA_CONFIG.md)
- **Workflow de Prisma**: [`../docs/PRISMA_WORKFLOW.md`](../docs/PRISMA_WORKFLOW.md)

## Soporte

Si GitHub Copilot no está siguiendo las directrices:

1. **VS Code**: Verifica que el archivo existe en `.github/copilot-instructions.md`
2. **Reinicia el IDE**: A veces es necesario reiniciar
3. **Contexto**: Copilot aprende del código existente. Los archivos abiertos afectan las sugerencias
4. **Actualiza Copilot**: Asegúrate de tener la última versión instalada

---

**Última actualización**: Marzo 2026  
**Versión de Prisma**: 5.22.0  
**Versión de Next.js**: 15.3.2  
**Versión de NestJS**: 11
