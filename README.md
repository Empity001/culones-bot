# 🤖 Culones RPG — Bot de Discord

Bot modular para Discord que gestiona el código de admin, detecta nuevos logs del juego y los anuncia en el servidor.

## Arquitectura

```
src/
├── index.js              → Punto de entrada. Carga comandos y eventos automáticamente.
├── config.js             → Variables de entorno. El bot no arranca si falta alguna.
├── deploy-commands.js    → Script para registrar slash commands en Discord.
│
├── commands/             → Un archivo = un comando slash
│   ├── ping.js           → Diagnóstico de latencia
│   ├── getcode.js        → Envía el código admin por DM (solo autorizados)
│   └── setlogchannel.js  → Configura el canal donde se anuncian logs
│
├── events/               → Un archivo = un evento de Discord
│   ├── ready.js          → Arranca el cron y el watcher al conectar
│   └── interactionCreate.js → Despacha slash commands
│
├── services/             → Lógica de negocio y conexiones externas
│   ├── supabase.js       → Cliente Supabase (singleton, service_role)
│   ├── adminCode.js      → Genera y rota el código admin cada 24h
│   ├── botConfig.js      → Configuración persistente en Supabase
│   └── logWatcher.js     → Suscripción Realtime a nuevos logs
│
└── utils/
    ├── embeds.js         → Builders de embeds de Discord
    └── isAuthorized.js   → Comprueba si un usuario está autorizado

sql/
└── bot_tables.sql        → Tablas nuevas para el bot (ejecutar en Supabase)
```

## Setup paso a paso

### 1. Supabase — crear las tablas del bot

Ve al **SQL Editor** de tu proyecto de Supabase y ejecuta el contenido de `sql/bot_tables.sql`.

### 2. Crear el bot en Discord

1. Ve a [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → ponle un nombre
3. Ve a **Bot** → **Reset Token** → copia el token → `DISCORD_TOKEN`
4. En la misma página activa **Message Content Intent** si lo necesitas (para este bot no)
5. Ve a **General Information** → copia el **Application ID** → `DISCORD_CLIENT_ID`
6. Ve a **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Bot Permissions: `Send Messages`, `Embed Links`, `View Channel`
   - Copia la URL generada y úsala para invitar el bot a tu servidor

### 3. Obtener los IDs de Discord

Activa el **Modo Desarrollador** en Discord (Ajustes → Avanzado → Modo Desarrollador).

- **Guild ID**: clic derecho en el nombre del servidor → Copiar ID → `DISCORD_GUILD_ID`
- **Tu user ID**: clic derecho en tu nombre → Copiar ID → `AUTHORIZED_USER_IDS`

Si quieres autorizar a más personas, separa los IDs con coma: `123456,789012`

### 4. Variables de entorno

Crea un archivo `.env` copiando `.env.example` y rellena todos los valores:

```env
DISCORD_TOKEN=tu_token_aqui
DISCORD_CLIENT_ID=tu_client_id
DISCORD_GUILD_ID=id_del_servidor
AUTHORIZED_USER_IDS=tu_id_de_discord
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SITE_URL=https://tu-web.github.io   # opcional, aparece en los embeds
```

> ⚠️ **NUNCA** subas `.env` a GitHub. Está en `.gitignore`.

### 5. Instalar dependencias y registrar comandos

```bash
npm install
npm run deploy   # registra los slash commands en Discord (solo una vez o cuando los cambies)
```

### 6. Ejecutar en local

```bash
npm run dev   # con --watch, se reinicia al cambiar archivos
```

### 7. Desplegar en Railway

1. Sube el proyecto a un repositorio de GitHub (el `.env` NO se sube)
2. Ve a [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Selecciona el repositorio
4. Ve a **Variables** y agrega las mismas variables de `.env.example` con sus valores reales
5. Railway detecta el `package.json` con `"start": "node src/index.js"` y lo despliega automáticamente
6. Cada vez que hagas push a GitHub, Railway redespliega solo

## Comandos disponibles

| Comando | Descripción | Quién puede usarlo |
|---|---|---|
| `/ping` | Latencia del bot y Supabase | Cualquiera |
| `/getcode` | Recibe el código admin por DM | Solo IDs autorizados |
| `/setlogchannel #canal` | Configura el canal de anuncios | Solo IDs autorizados |

## Agregar un nuevo comando

1. Crea `src/commands/micomando.js` exportando `data` y `execute`
2. Corre `npm run deploy` para registrarlo en Discord
3. El bot lo cargará automáticamente al reiniciar (no hay que tocar `index.js`)

## Agregar un nuevo evento

1. Crea `src/events/mievento.js` exportando `name`, `once` y `execute`
2. El bot lo carga automáticamente al reiniciar
