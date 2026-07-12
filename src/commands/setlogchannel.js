import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { updateGuildConfig } from '../services/botConfig.js';
import { buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';
import { requireOwnerOrAdministrator } from '../utils/permissions.js';
import { getGuildConfig } from '../services/botConfig.js';
import { recordDiscordAudit } from '../services/audit.js';

export const data = new SlashCommandBuilder()
  .setName('setlogchannel')
  .setDescription('Configura el canal donde se anuncian los Logs')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(option => option
    .setName('canal')
    .setDescription('Canal de texto donde se publicarán los Logs')
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(true));

export async function execute(interaction) {
  if (!(await requireOwnerOrAdministrator(interaction, buildErrorEmbed))) return;
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.options.getChannel('canal', true);
  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  const perms = channel.permissionsFor(me);
  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.CreatePublicThreads,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageThreads,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
  ];
  const missing = required.filter(flag => !perms?.has(flag));
  if (missing.length) {
    await interaction.editReply({ embeds: [buildErrorEmbed(`No tengo todos los permisos necesarios en ${channel}. Necesito ver el canal, enviar mensajes, insertar enlaces, adjuntar archivos, crear y gestionar hilos, escribir dentro de ellos, mencionar @everyone de forma silenciosa y gestionar los permisos del canal (Gestionar roles).`)] });
    return;
  }
  try {
    const previous = await getGuildConfig();
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
      [PermissionFlagsBits.ViewChannel]: true,
      [PermissionFlagsBits.ReadMessageHistory]: true,
      [PermissionFlagsBits.AddReactions]: true,
      [PermissionFlagsBits.SendMessagesInThreads]: false,
      [PermissionFlagsBits.CreatePublicThreads]: false,
      [PermissionFlagsBits.CreatePrivateThreads]: false,
    }, { reason: `Canal de Logs configurado por ${interaction.user.tag}` });

    await channel.permissionOverwrites.edit(me.id, {
      [PermissionFlagsBits.ViewChannel]: true,
      [PermissionFlagsBits.SendMessages]: true,
      [PermissionFlagsBits.SendMessagesInThreads]: true,
      [PermissionFlagsBits.CreatePublicThreads]: true,
      [PermissionFlagsBits.EmbedLinks]: true,
      [PermissionFlagsBits.AttachFiles]: true,
      [PermissionFlagsBits.ReadMessageHistory]: true,
      [PermissionFlagsBits.ManageThreads]: true,
      [PermissionFlagsBits.MentionEveryone]: true,
    }, { reason: 'Permisos del bot para publicar y mantener los Logs' });
    await updateGuildConfig({ log_channel_id: channel.id, updated_by: interaction.user.id });
    await recordDiscordAudit(interaction, {
      action: 'log_channel_changed',
      description: `${interaction.member?.displayName || interaction.user.username} configuró #${channel.name} como canal oficial de Logs y aplicó permisos de hilo de solo lectura.`,
      entityType: 'discord_log_channel', entityId: channel.id, entityName: channel.name,
      oldValue: { channel_id: previous?.log_channel_id || null }, newValue: { channel_id: channel.id, channel_name: channel.name },
    });
    await interaction.editReply({ embeds: [buildSuccessEmbed('Canal de Logs configurado', `${interaction.user} configuró ${channel} como canal oficial de Logs.`)] });
  } catch (error) {
    console.error('[setlogchannel]', error);
    await interaction.editReply({ embeds: [buildErrorEmbed(`No se pudo guardar el canal: ${error.message}`)] });
  }
}
