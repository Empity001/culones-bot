// src/config.js
// Todas las variables de entorno en un solo lugar.
// El bot no arranca si falta algo crítico.

const required = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUTHORIZED_USER_IDS',
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`[Config] ❌ Falta la variable de entorno: ${key}`);
    process.exit(1);
  }
}

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.DISCORD_CLIENT_ID,
    guildId: process.env.DISCORD_GUILD_ID,
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    // El bot usa service_role para escribir libremente en Supabase
    // (nunca expongas esta clave en el frontend)
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  // Lista de IDs de Discord que pueden pedir el código admin
  authorizedUserIds: process.env.AUTHORIZED_USER_IDS
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
};
