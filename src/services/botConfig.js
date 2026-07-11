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

export async function getConfigValue(key) {
  const cfg = await getGuildConfig();
  if (!cfg) return null;
  return cfg[key] ?? null;
}

export async function setConfigValue(key, value, updatedBy = null) {
  return updateGuildConfig({ [key]: value, updated_by: updatedBy });
}

export const CONFIG_KEYS = {
  LOG_CHANNEL_ID: 'log_channel_id',
  ADMIN_ROLE_ID: 'admin_role_id',
  GUIDES_FORUM_CHANNEL_ID: 'guides_forum_channel_id',
  FORUM_REACTIONS: 'forum_reactions',
};
