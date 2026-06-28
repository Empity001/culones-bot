// src/commands/setlogchannel.js
// Slash command: /setlogchannel #canal
// Visible para todos, solo funciona para IDs autorizadas.

import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { isAuthorized } from '../utils/isAuthorized.js';
import { setConfigValue, CONFIG_KEYS } from '../services/botConfig.js';
import { buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('setlogchannel')
  .setDescription('Configura el canal donde se anuncian nuevos logs del juego (solo autorizados)')
  .addChannelOption((option) =>
    option
      .setName('canal')
      .setDescription('Canal de texto donde se publicarán los nuevos logs')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  );

export async function execute(interaction) {
  if (!isAuthorized(interaction.user.id)) {
    await interaction.reply({
      embeds: [buildErrorEmbed('No tienes permiso para usar este comando.')],
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('canal');

  const perms = channel.permissionsFor(interaction.guild.members.me);
  if (!perms.has(PermissionFlagsBits.SendMessages)) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(`No tengo permisos para escribir en ${channel}.`)],
    });
    return;
  }

  try {
    await setConfigValue(CONFIG_KEYS.LOG_CHANNEL_ID, channel.id);
    await interaction.editReply({
      embeds: [
        buildSuccessEmbed(
          'Canal configurado',
          `Los nuevos logs se anunciarán en ${channel}. 📢`
        ),
      ],
    });
  } catch (err) {
    console.error('[setlogchannel]', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed('Error guardando la configuración. Revisa los logs.')],
    });
  }
}
