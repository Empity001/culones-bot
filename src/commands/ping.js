// src/commands/ping.js
// Comando de diagnóstico: muestra latencia del bot y de Supabase.

import { SlashCommandBuilder } from 'discord.js';
import { buildSuccessEmbed } from '../utils/embeds.js';
import { supabase } from '../services/supabase.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Comprueba que el bot está activo y muestra la latencia');

export async function execute(interaction) {
  const start = Date.now();

  // Ping a Supabase
  let supabaseMs = '?';
  try {
    const t = Date.now();
    await supabase.from('bot_config').select('key').limit(1);
    supabaseMs = `${Date.now() - t}ms`;
  } catch {
    supabaseMs = 'Error';
  }

  await interaction.reply({
    embeds: [
      buildSuccessEmbed(
        'Pong!',
        [
          `🏓 **Latencia Discord:** ${Date.now() - start}ms`,
          `🌐 **Latencia WebSocket:** ${interaction.client.ws.ping}ms`,
          `🗄️ **Latencia Supabase:** ${supabaseMs}`,
        ].join('\n')
      ),
    ],
    ephemeral: true,
  });
}
