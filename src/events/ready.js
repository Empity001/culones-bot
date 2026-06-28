// src/events/ready.js
// Se ejecuta una vez cuando el bot está listo y conectado a Discord.
// Aquí arrancamos:
//   1. El cron de rotación de código admin (cada 24h)
//   2. La suscripción Realtime de Supabase para detectar nuevos logs

import { Events } from 'discord.js';
import cron from 'node-cron';
import { rotateAdminCode } from '../services/adminCode.js';
import { startLogWatcher } from '../services/logWatcher.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client) {
  console.log(`[Ready] ✅ Bot conectado como ${client.user.tag}`);

  // ── 1. Rotar código admin al arrancar ─────────────────────────────
  try {
    const code = await rotateAdminCode();
    console.log(`[Ready] 🔑 Código inicial generado: ${code}`);
  } catch (err) {
    console.error('[Ready] Error generando código inicial:', err.message);
  }

  // ── 2. Cron: rotar código cada 24 horas a medianoche UTC ──────────
  // '0 0 * * *' = a las 00:00 UTC todos los días
  cron.schedule('0 0 * * *', async () => {
    try {
      const code = await rotateAdminCode();
      console.log(`[Cron] 🔑 Código rotado: ${code}`);
    } catch (err) {
      console.error('[Cron] Error rotando código:', err.message);
    }
  });

  // ── 3. Suscripción Realtime para nuevos logs ───────────────────────
  startLogWatcher(client);
}
