# Culones RPG — Bot de Discord

Bot exclusivo del servidor oficial de Culones RPG. Conecta Discord con la web y Supabase: publica Logs, sincroniza Guías con un foro, genera screenshots y valida el rol que permite administrar la página.

## Comandos

| Comando | Uso | Permiso |
|---|---|---|
| `/ping` | Comprueba Discord y Supabase | Cualquiera |
| `/screenshot tierlist` | Genera la Tierlist completa o una columna | Cualquiera |
| `/screenshot guias` | Genera el catálogo de Guías | Cualquiera |
| `/screenshot guia` | Genera una imagen por rango | Cualquiera |
| `/screenshot kits` | Genera los Kits recomendados | Cualquiera |
| `/screenshot logs` | Genera la lista o el detalle de un Log | Cualquiera |
| `/config logs set/view/clear` | Configura el canal de Logs y sus hilos de solo lectura | Propietario o `Administrator` |
| `/config admin set/view/clear` | Configura el único rol que concede administración web | Propietario o `Administrator` |
| `/config guias set/view/clear` | Configura el foro de Guías | Propietario o `Administrator` |

`/getcode` ya no existe. El acceso administrativo se realiza desde la web mediante Discord OAuth y el rol elegido con `/config admin set`.

## Logs automáticos

Cada Log produce:

1. Un resumen en el canal configurado, con portada solo cuando el Log tenga una.
2. Un hilo público de solo lectura.
3. Un mensaje independiente por mob.
4. Un mensaje independiente por item.
5. Un mensaje independiente por Extra.
6. Un mensaje final con enlace a la web.

Cada elemento enlaza al punto exacto de la página mediante `log`, `tab` y `entry`. La web selecciona el Log, abre la pestaña, despliega la ficha, hace scroll y la resalta.

El bot guarda un `message_map` y un `message_order` persistentes. Al editar el contenido:

- una sincronización fallida se reintenta hasta tres veces con espera incremental;
- el barrido de integridad recupera publicaciones dañadas y Logs públicos que nunca alcanzaron a crear su primer mapeo;
- el contenido extenso se divide por elemento y continuación respetando los límites de Discord.
- Edita mensajes existentes por ID de elemento.
- Crea los nuevos.
- Elimina los que ya no existen.
- Reconstruye mensajes, hilos o resúmenes borrados.
- Agrupa eventos cercanos sin perder la edición más reciente.

## Foro de Guías

La publicación en la web y en Discord son estados separados. Desde la web, un administrador puede:

- **Publicar en foro**.
- **Actualizar en foro** cuando el contenido cambie.
- **Despublicar del foro**.
- **Volver a publicar** cuando el post se haya eliminado manualmente.

Cada Guía crea una sola publicación con todos sus rangos. El bot organiza información general, descripciones, estadísticas, habilidades, recursos, Mesas de trabajo y Extras en mensajes separados. Secciones largas se dividen en continuaciones.

Las publicaciones usan dos etiquetas:

- `C · Categoría`
- `T · Tipo`

El bot crea y reutiliza las etiquetas por ID. Si el foro alcanza su límite, la publicación falla con un mensaje explicativo en la web.

La cola `guide_forum_jobs` es duradera e idempotente. Si Railway se reinicia, los trabajos pendientes continúan y los que quedaron interrumpidos se recuperan.


## Recuperación ante borrados manuales

El bot escucha eliminaciones de mensajes e hilos y también ejecuta una comprobación de integridad al iniciar y cada hora:

- Un mensaje interno de una Guía borrado marca la publicación como desactualizada para que **Actualizar en foro** lo reconstruya.
- Una publicación de Guía eliminada cambia a estado **lost** y muestra **Volver a publicar**.
- Un resumen, hilo o mensaje interno de Log eliminado se reconstruye automáticamente.
- Los borrados intencionales realizados por el propio bot se suprimen temporalmente para no iniciar una recuperación falsa.

## Imágenes y pixel art

Las imágenes estáticas de hasta 64×64 se tratan como pixel art:

- Escalado a 256×256.
- Nearest-neighbor.
- Sin antialiasing.
- Fondo transparente.
- Conserva proporción.

La imagen escalada se adjunta directamente a Discord; no se almacena permanentemente en Supabase ni en Railway. Las imágenes grandes se envían sin ese tratamiento.

Las Mesas de trabajo se renderizan como interfaces visuales de Minecraft, acompañadas por una versión textual de materiales y cantidades.

## Sistema visual de Discord

Las publicaciones automáticas comparten una composición visual única y toman sus colores del tema configurado en la web:

- Los Logs comienzan con un resumen compacto y continúan con fichas separadas para mobs, items y Extras.
- Las imágenes de fichas se muestran como miniaturas para conservar una lectura rápida; las portadas y recursos visuales mantienen formato panorámico.
- Las Guías separan claramente cada rango y organizan descripción, estadísticas, habilidades, recursos y fabricación por bloques.
- Los métodos de fabricación conservan la lectura de Minecraft dentro de un marco negro, morado y dorado propio de Culones RPG.
- Mesa de crafteo, horno normal, alto horno, ahumador, mesa de herrería e intercambio tienen composiciones específicas.
- El resultado de cada receta usa un slot destacado y la versión textual conserva cantidades y enlaces a Guías relacionadas.
- Los textos extensos se dividen en continuaciones sin superar los límites de Discord.

## Screenshots

Los renderizadores usan una temática oscura y morada coherente con el rebranding de la web. Los resultados compartibles se envían públicamente con un texto como:

> @Usuario solicitó el detalle del Log «Cumpleaños».

La interacción privada se usa solo mientras se procesa y se elimina al terminar. Los errores sí permanecen privados. Si una Guía genera más de diez imágenes, se divide en varios mensajes sin repetir el ping.

## Reacciones del foro

Discord permite una reacción nativa predeterminada por foro, pero Culones RPG admite hasta 20 reacciones configuradas desde Herramientas. El bot las coloca en el primer mensaje de cada publicación. Se pueden aplicar a posts existentes mediante la cola, respetando rate limits.

## Arquitectura

```text
src/
├── commands/
│   ├── adminrole.js
│   ├── config.js
│   ├── guidesforum.js
│   ├── ping.js
│   ├── screenshot.js
│   └── setlogchannel.js
├── events/
│   ├── interactionCreate.js
│   ├── messageDelete.js
│   ├── threadDelete.js
│   └── ready.js
├── services/
│   ├── audit.js
│   ├── botConfig.js
│   ├── deletionSuppressor.js
│   ├── guideForumWorker.js
│   ├── logPublication.js
│   ├── logWatcher.js
│   ├── publicationRecovery.js
│   ├── siteTheme.js
│   └── ...lectores de Supabase
└── utils/
    ├── guideForumEmbeds.js
    ├── logMessages.js
    ├── mediaAttachments.js
    ├── renderWorkbench.js
    └── ...renderizadores Canvas
```

La migración compartida está en:

```text
sql/migration_021_discord_auth_and_forum.sql
```

## Variables de entorno

```env
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SITE_URL=https://empity001.github.io/culones-rpg/
GUIDE_JOB_POLL_MS=15000
GUIDE_JOB_MAX_ATTEMPTS=5
```

No uses `AUTHORIZED_USER_IDS`. No incluyas el token, el Client Secret ni la service role en GitHub.

## Instalación

```bash
npm install
npm run deploy
npm start
```

`npm run deploy` registra todos los comandos en el servidor indicado por `DISCORD_GUILD_ID` y reemplaza el conjunto anterior. Los comandos que configuran canales (`/config logs set` y `/config guias set`) también requieren que el bot tenga **Gestionar roles**, porque Discord usa ese permiso para editar los overwrites del canal, además de **Gestionar canales** y los permisos de envío/hilos indicados.

Después del primer despliegue ejecuta:

```text
/config admin set rol:@AdministradoresWeb
/config logs set canal:#logs
/config guias set canal:#guias
```

Consulta `GUIA_DESPLIEGUE_DISCORD_AUTH.md` en el proyecto web para el orden completo de Supabase Auth, Edge Functions, SQL, Railway y GitHub Pages.

## Validación

Antes de desplegar:

```bash
npm ci
npm ls --depth=0
find src -name '*.js' -print0 | xargs -0 -n1 node --check
npm audit
```

El flujo automático activo se construye en `src/utils/logMessages.js`. `src/utils/embeds.js` contiene solo las respuestas genéricas de comandos; la implementación legacy de embeds monolíticos fue retirada.

El bot solicita `Guilds` y `GuildMessages`. `GuildMessages` se usa únicamente para recibir eventos de eliminación y recuperar mensajes o hilos propios; no lee el contenido de los mensajes. No necesita ni solicita `Message Content`.

### Visibilidad de Logs

Ejecuta `sql/migration_022_log_visibility.sql`. Los anuncios nuevos mencionan `@everyone` usando la bandera silenciosa de Discord, y el watcher elimina de Discord los Logs despublicados.
