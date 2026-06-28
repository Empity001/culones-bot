// src/services/logWatcher.js
import { supabase } from './supabase.js';
import { getConfigValue, CONFIG_KEYS } from './botConfig.js';
import { buildLogEmbed } from '../utils/embeds.js';

const SITE_URL = process.env.SITE_URL ?? '';

export function startLogWatcher(client) {
  supabase
    .channel('bot-log-watcher')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'logs' },
      async (payload) => {
        console.log(`[LogWatcher] Nuevo log: "${payload.new.title}"`);
        try {
          await handleNewLog(client, payload.new);
        } catch (err) {
          console.error('[LogWatcher] Error en INSERT:', err.message);
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'logs' },
      async (payload) => {
        console.log(`[LogWatcher] Log editado: "${payload.new.title}"`);
        try {
          await handleUpdatedLog(client, payload.new);
        } catch (err) {
          console.error('[LogWatcher] Error en UPDATE:', err.message);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[LogWatcher] ✅ Suscrito a logs (INSERT + UPDATE)');
      } else {
        console.log('[LogWatcher] Estado:', status);
      }
    });
}

async function getLogData(log) {
  const { data: categoryData } = await supabase
    .from('categories')
    .select('*')
    .eq('slug', log.category)
    .single();

  const { data: mobs } = await supabase
    .from('log_mobs')
    .select('*')
    .eq('log_id', log.id)
    .order('sort_order', { ascending: true });

  const { data: items } = await supabase
    .from('log_items')
    .select('*')
    .eq('log_id', log.id)
    .order('sort_order', { ascending: true });

  return { categoryData, mobs: mobs ?? [], items: items ?? [] };
}

async function getDiscordChannel(client) {
  const channelId = await getConfigValue(CONFIG_KEYS.LOG_CHANNEL_ID);
  if (!channelId) {
    console.warn('[LogWatcher] No hay canal configurado. Usa /setlogchannel.');
    return null;
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) console.warn(`[LogWatcher] Canal ${channelId} no encontrado.`);
  return channel;
}

async function handleNewLog(client, log) {
  const channel = await getDiscordChannel(client);
  if (!channel) return;

  const { categoryData, mobs, items } = await getLogData(log);
  const embed = buildLogEmbed(log, categoryData, mobs, items, SITE_URL);

  const message = await channel.send({ embeds: [embed] });

  // Guardar el message_id en Supabase para poder editarlo después
  await supabase
    .from('logs')
    .update({ discord_message_id: message.id })
    .eq('id', log.id);

  console.log(`[LogWatcher] ✅ Embed enviado (message: ${message.id})`);
}

async function handleUpdatedLog(client, log) {
  if (!log.discord_message_id) {
    console.warn(`[LogWatcher] Log ${log.id} no tiene discord_message_id, saltando.`);
    return;
  }

  const channel = await getDiscordChannel(client);
  if (!channel) return;

  const { categoryData, mobs, items } = await getLogData(log);
  const embed = buildLogEmbed(log, categoryData, mobs, items, SITE_URL);

  try {
    const message = await channel.messages.fetch(log.discord_message_id);
    await message.edit({ embeds: [embed] });
    console.log(`[LogWatcher] ✅ Embed editado (message: ${log.discord_message_id})`);
  } catch (err) {
    // Si el mensaje ya no existe, mandar uno nuevo
    console.warn(`[LogWatcher] Mensaje no encontrado, mandando nuevo: ${err.message}`);
    const message = await channel.send({ embeds: [embed] });
    await supabase
      .from('logs')
      .update({ discord_message_id: message.id })
      .eq('id', log.id);
  }
}
