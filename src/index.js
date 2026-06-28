// src/index.js
// Punto de entrada del bot.
// Carga comandos y eventos automáticamente desde sus carpetas
// — para agregar algo nuevo, solo crea el archivo, no hay que tocar este archivo.

import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

// Cargar config primero (valida variables de entorno)
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Cliente de Discord ─────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // Solo los intents mínimos necesarios — el bot no necesita leer mensajes
  ],
});

// Colección de comandos disponibles
client.commands = new Collection();

// ── Cargar Comandos ────────────────────────────────────────────────────────────
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = pathToFileURL(join(commandsPath, file)).href;
  const command = await import(filePath);

  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[Commands] Cargado: /${command.data.name}`);
  } else {
    console.warn(`[Commands] ⚠️  ${file} no exporta 'data' o 'execute'`);
  }
}

// ── Cargar Eventos ─────────────────────────────────────────────────────────────
const eventsPath = join(__dirname, 'events');
const eventFiles = readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = pathToFileURL(join(eventsPath, file)).href;
  const event = await import(filePath);

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`[Events] Cargado: ${event.name}`);
}

// ── Manejo global de errores no capturados ────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('[Process] unhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] uncaughtException:', err);
});

// ── Conectar ──────────────────────────────────────────────────────────────────
client.login(config.discord.token);
