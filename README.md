# 🤖 Culones RPG — Bot de Discord

Bot que conecta el servidor de Discord con la web de **culones-rpg**: gestiona el código temporal de administrador, anuncia automáticamente los logs nuevos del juego, y permite capturar cualquier sección de la web (tierlist, logs, armas) como imagen para compartirla en un canal.

---

## 📋 Qué hace este bot

### 🔑 Código de administrador (rotación automática)

La web tiene un modo de administrador protegido por un código temporal — este bot es quien lo genera y lo entrega, nunca se escribe a mano.

- **Al arrancar el bot**, y luego **automáticamente cada 24 horas** (a las 00:00 UTC), se genera un código nuevo de 8 caracteres alfanuméricos (sin `0`, `O`, `I`, `l` para evitar confusiones al copiarlo) y se guarda en Supabase con su fecha de expiración. El código anterior queda desactivado en el mismo momento.
- **`/getcode`** — el único modo de obtenerlo. Solo responde a los IDs de Discord listados en `AUTHORIZED_USER_IDS`; cualquier otra persona recibe un mensaje de "no tienes permiso" y no ve nada más. Si está autorizado, el bot le envía el código **por mensaje privado** (nunca en el canal, ni siquiera en una respuesta efímera del propio canal), junto con la fecha exacta de expiración. Si el usuario tiene los DMs cerrados, se le avisa que debe habilitarlos.

### 📢 Anuncio automático de logs nuevos

El bot está suscrito en tiempo real a la tabla de logs de Supabase — no consulta cada X minutos, reacciona al instante cuando algo cambia.

- **Log nuevo publicado en la web** → el bot construye un embed (título, descripción, categoría con su emoji/color, relevancia, fecha, y el detalle de cada mob/item/bloque libre adjunto) y lo publica en el canal configurado.
- **Log editado en la web** → en vez de publicar un mensaje duplicado, el bot **edita el mismo mensaje de Discord ya existente** con la información actualizada. Si por algún motivo ese mensaje fue borrado manualmente del canal, el bot lo detecta y publica uno nuevo en su lugar.
- **`/setlogchannel #canal`** — define a qué canal de texto se publican estos anuncios. Solo funciona para los IDs autorizados (el comando es visible para cualquiera, pero solo responde con éxito a quien está en la lista). El bot comprueba que tiene permiso de escritura en ese canal antes de guardarlo.

### 🖼️ `/screenshot` — capturar una sección de la web como imagen

Comando con tres subcomandos, todos restringidos a los IDs autorizados (incluido el autocompletado: alguien sin permiso no puede ni ver sugerencias de nombres de armas).

- **`/screenshot tierlist columna:<Arma|Sub-arma|Accesorio> [canal]`** — genera una imagen de esa columna completa de la tierlist: cada fila (tier) con su color y nombre, y los personajes/elementos que contiene con su miniatura en pixel-art nítido.
- **`/screenshot logs [cantidad] [canal]`** — genera una imagen tipo lista con los logs más recientes (por defecto 10, máximo 20): título, categoría, relevancia y fecha de cada uno, ordenados del más nuevo al más viejo.
- **`/screenshot arma nombre:<autocompletado> [canal]`** — mientras se escribe el nombre, Discord sugiere armas que coincidan (busca en las armas publicadas de la Guía de Armas). Al confirmar, el bot genera **una imagen separada por cada rango** que tenga esa arma (MK1, MK2...), incluyendo en cada una: descripción del rango, estadísticas, habilidades con su barra de nivel, y la receta de mejora (materiales → resultado) si la tiene. Todas las imágenes del arma se mandan juntas en el mismo mensaje.

En los tres casos, si no se especifica `canal`, la imagen se envía al canal donde se ejecutó el comando. El bot comprueba que tiene permiso para adjuntar archivos en el canal destino antes de generar nada.

### 🏓 `/ping` — diagnóstico

Visible para cualquiera. Responde con la latencia del bot hacia Discord (WebSocket) y hacia Supabase, útil para confirmar que ambas conexiones están sanas sin tener que revisar logs del servidor.

---

## 🔒 Quién puede usar qué

| Comando | Quién puede usarlo |
|---|---|
| `/ping` | Cualquiera |
| `/getcode` | Solo IDs en `AUTHORIZED_USER_IDS` |
| `/setlogchannel` | Solo IDs en `AUTHORIZED_USER_IDS` |
| `/screenshot` (los 3 subcomandos) | Solo IDs en `AUTHORIZED_USER_IDS` |

La autorización es siempre por **ID de usuario de Discord**, no por rol del servidor — es la misma lista para todo el bot, definida en la variable de entorno `AUTHORIZED_USER_IDS` (uno o varios IDs separados por coma).

---

## 🧱 Arquitectura

```
src/
├── index.js              → Punto de entrada. Carga comandos y eventos automáticamente.
├── config.js             → Variables de entorno. El bot no arranca si falta alguna.
├── deploy-commands.js    → Script para registrar slash commands en Discord.
│
├── commands/             → Un archivo = un comando slash
│   ├── ping.js           → Diagnóstico de latencia
│   ├── getcode.js        → Envía el código admin por DM (solo autorizados)
│   ├── setlogchannel.js  → Configura el canal donde se anuncian logs
│   └── screenshot.js     → Captura tierlist / logs / arma como imagen (solo autorizados)
│
├── events/               → Un archivo = un evento de Discord
│   ├── ready.js          → Genera el primer código, arranca el cron de 24h y el watcher
│   └── interactionCreate.js → Despacha slash commands y autocompletados
│
├── services/             → Lógica de negocio y conexiones externas
│   ├── supabase.js       → Cliente Supabase (singleton, service_role)
│   ├── adminCode.js      → Genera y rota el código admin cada 24h
│   ├── botConfig.js      → Configuración persistente en Supabase (ej. canal de logs)
│   ├── logWatcher.js     → Suscripción Realtime: publica/edita embeds de logs
│   ├── tierlist.js       → Carga filas/items de la tierlist
│   ├── weapons.js        → Busca armas (autocompletado) y carga ficha + rangos
│   └── logs.js           → Carga los logs más recientes con su categoría
│
└── utils/
    ├── embeds.js          → Builders de embeds de Discord
    ├── isAuthorized.js    → Comprueba si un usuario está en la lista autorizada
    ├── renderTierlist.js  → Dibuja la imagen de una columna de la tierlist
    ├── renderWeapon.js    → Dibuja la imagen de un rango de arma (stats/habilidades/receta)
    └── renderLogs.js      → Dibuja la imagen con la lista de logs recientes

sql/
└── bot_tables.sql        → Tablas que este bot necesita en Supabase (admin_codes, bot_config)
```

---

## ⚙️ Instalación (resumen)

1. **Supabase**: ejecuta `sql/bot_tables.sql` en el SQL Editor de tu proyecto.
2. **Discord**: crea una aplicación en [discord.com/developers/applications](https://discord.com/developers/applications) → pestaña **Bot** → copia el token (`DISCORD_TOKEN`) → **General Information** → copia el Application ID (`DISCORD_CLIENT_ID`) → **OAuth2 → URL Generator** con scopes `bot` + `applications.commands` y permisos `Send Messages`, `Embed Links`, `Attach Files`, `View Channel` para generar el link de invitación.
3. **IDs**: activa el Modo Desarrollador en Discord y copia el ID del servidor (`DISCORD_GUILD_ID`) y tu propio ID de usuario (`AUTHORIZED_USER_IDS`, separa varios con coma).
4. **Variables de entorno** — crea un `.env` con: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `AUTHORIZED_USER_IDS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, y opcionalmente `SITE_URL` (aparece enlazada en los embeds de logs). Nunca subas este archivo a GitHub.
5. **Instalar y registrar comandos**:
   ```bash
   npm install
   npm run deploy   # registra los slash commands en Discord
   ```
6. **Ejecutar**: `npm run dev` en local (se reinicia solo al cambiar archivos), o sube el repo a [Railway](https://railway.app) → New Project → Deploy from GitHub → agrega las mismas variables de entorno en **Variables**. Railway detecta `"start": "node src/index.js"` y despliega automáticamente; cada push a GitHub redespliega solo.

> 📌 Si ya tenías el bot desplegado con el comando antiguo `/sendtierlist`, fue reemplazado por `/screenshot tierlist`. Al correr `npm run deploy` de nuevo, Discord sobrescribe el set completo de comandos con los que existan en `src/commands/` — `/sendtierlist` deja de aparecer automáticamente.

### Agregar un comando o evento nuevo

- **Comando**: crea `src/commands/micomando.js` exportando `data` y `execute` (y `autocomplete` si lo necesita) → corre `npm run deploy`. No hay que tocar `index.js`.
- **Evento**: crea `src/events/mievento.js` exportando `name`, `once` y `execute` → se carga solo al reiniciar.
