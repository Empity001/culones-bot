// src/services/botConfig.js
// Configuración persistente del bot guardada en Supabase.
// Actualmente maneja: qué canal recibe los embeds de nuevos logs.

import { supabase } from './supabase.js';

const TABLE = 'bot_config';

/**
 * Obtiene un valor de configuración por clave.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function getConfigValue(key) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) return null;
  return data.value;
}

/**
 * Guarda (upsert) un valor de configuración.
 * @param {string} key
 * @param {string} value
 */
export async function setConfigValue(key, value) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, value }, { onConflict: 'key' });

  if (error) throw new Error(`[BotConfig] Error guardando ${key}: ${error.message}`);
}

// Claves conocidas (para autocompletado y evitar typos)
export const CONFIG_KEYS = {
  LOG_CHANNEL_ID: 'log_channel_id',
};
