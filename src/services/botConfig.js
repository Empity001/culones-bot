// src/services/botConfig.js
// Configuración persistente del único servidor oficial.

import { supabase } from './supabase.js';
import { config } from '../config.js';

const TABLE = 'discord_guild_config';

export async function getGuildConfig() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('guild_id', config.discord.guildId)
    .maybeSingle();

  if (error) throw new Error(`[BotConfig] Error leyendo configuración: ${error.message}`);
  return data || null;
}

export async function updateGuildConfig(patch = {}) {
  const row = {
    guild_id: config.discord.guildId,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'guild_id' })
    .select('*')
    .single();
  if (error) throw new Error(`[BotConfig] Error guardando configuración: ${error.message}`);
  return data;
}
