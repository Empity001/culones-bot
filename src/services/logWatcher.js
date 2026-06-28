// src/services/logWatcher.js
// Escucha cambios INSERT en la tabla `logs` vía Supabase Realtime.
// Cuando llega un nuevo log, busca sus mobs/items y manda un embed al canal configurado.

import { supabase } from './supabase.js';
import { getConfigValue, CONFIG_KEYS } from './botConfig.js';
import { buildLogEmbed } from '../utils/embeds.js';

// URL de la web — opcional, se puede agregar como variable de entorno
const SITE_URL = process.env.SITE_URL ?? '';

/**
 * Arranca el watcher. Se llama desde events/ready.js.
 * @param {import('discord.js').Client} client
 */
export function startLogWatcher(client) {
  const channel = supabase
    .channel('bot-log-watcher')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'logs' },
      async (payload) => {
        const log = payload.new;
        console.log(`[LogWatcher] Nuevo log detectado: "${log.title}" (id: ${log.id})`);

        try {
          await handleNewLog(client, log);
        } catch (err) {
          console.error('[LogWatcher] Error procesando log:', err.message);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[LogWatcher] ✅ Suscrito a nuevos logs de Supabase Realtime');
      } else {
        console.log('[LogWatcher] Estado:', status);
      }
    });

  return channel;
}

/**
 * Procesa un nuevo log: busca datos relacionados y envía el embed.
 */
async function handleNewLog(client, log) {
  // Leer el canal configurado desde Supabase
  const channelId = await getConfigValue(CONFIG_KEYS.LOG_CHANNEL_ID);
  if (!channelId) {
    console.warn('[LogWatcher] No hay canal de logs configurado. Usa /setlogchannel.');
    return;
  }

  const discordChannel = await client.channels.fetch(channelId).catch(() => null);
  if (!discordChannel) {
    console.warn(`[LogWatcher] Canal ${channelId} no encontrado o sin acceso.`);
    return;
  }

  // Buscar categoría del log
  const { data: categoryData } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', log.category)
    .single();

  // Buscar mobs del log
  const { data: mobs } = await supabase
    .from('log_mobs')
    .select('*')
    .eq('log_id', log.id)
    .order('sort_order', { ascending: true });

  // Buscar items del log
  const { data: items } = await supabase
    .from('log_items')
    .select('*')
    .eq('log_id', log.id)
    .order('sort_order', { ascending: true });

  const embed = buildLogEmbed(
    log,
    categoryData ?? null,
    mobs ?? [],
    items ?? [],
    SITE_URL
  );

  await discordChannel.send({ embeds: [embed] });
  console.log(`[LogWatcher] ✅ Embed enviado a canal ${channelId}`);
}
