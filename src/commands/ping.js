// src/commands/ping.js
// Comando de diagnóstico: muestra latencia del bot y de Supabase.

import { SlashCommandBuilder } from 'discord.js';
import { buildSuccessEmbed } from '../utils/embeds.js';
import { supabase } from '../services/supabase.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Comprueba que el bot está activo y muestra la latencia');

export async function execute(interaction) {
  const startedAt = Date.now();
  await interaction.deferReply({ ephemeral: true });

  let supabaseMs = '?';
  try {
    const queryStartedAt = Date.now();
    const { error } = await supabase
      .from('discord_guild_config')
      .select('guild_id')
      .limit(1);
    if (error) throw error;
    supabaseMs = `${Date.now() - queryStartedAt}ms`;
  } catch (error) {
    console.warn('[Ping] No se pudo consultar Supabase:', error?.message || error);
    supabaseMs = 'Error';
  }

  await interaction.editReply({
    embeds: [
      buildSuccessEmbed(
        'Pong!',
        [
          `🏓 **Respuesta del comando:** ${Date.now() - startedAt}ms`,
          `🌐 **Latencia WebSocket:** ${interaction.client.ws.ping}ms`,
          `🗄️ **Latencia Supabase:** ${supabaseMs}`,
        ].join('\n')
      ),
    ],
  });
}
