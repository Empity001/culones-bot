import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { buildErrorEmbed, buildSuccessEmbed } from '../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../services/botConfig.js';
import { recordDiscordAudit } from '../services/audit.js';

const REQUIRED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
];

function missingPermissions(channel, me) {
  const perms = channel.permissionsFor(me);
  return REQUIRED.filter(flag => !perms?.has(flag)).map(flag => flag.toString());
}

export async function executeGuidesForum(interaction, sub) {
  try {
    if (sub === 'set') {
      const channel = interaction.options.getChannel('canal', true);
      if (channel.type !== ChannelType.GuildForum) {
        await interaction.editReply({ embeds: [buildErrorEmbed('El canal seleccionado no es un canal Foro.')] });
        return;
      }
      const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
      const missing = missingPermissions(channel, me);
      if (missing.length) {
        await interaction.editReply({ embeds: [buildErrorEmbed(`No puedo usar completamente ${channel}. Faltan permisos del bot. Revisa Ver canal, Gestionar canal, Gestionar roles/permisos, Enviar mensajes, Enviar mensajes en hilos, Insertar enlaces, Adjuntar archivos, Leer historial, Gestionar hilos, Gestionar mensajes y Añadir reacciones.`)] });
        return;
      }
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
        [PermissionFlagsBits.ViewChannel]: true,
        [PermissionFlagsBits.ReadMessageHistory]: true,
        [PermissionFlagsBits.AddReactions]: false,
        [PermissionFlagsBits.SendMessages]: false,
        [PermissionFlagsBits.SendMessagesInThreads]: false,
        [PermissionFlagsBits.CreatePublicThreads]: false,
        [PermissionFlagsBits.CreatePrivateThreads]: false,
      }, { reason: `Foro de Guías configurado por ${interaction.user.tag}` });

      // El deny de @everyone también alcanza al bot. Un overwrite de miembro
      // explícito garantiza que pueda seguir creando y sincronizando posts.
      await channel.permissionOverwrites.edit(me.id, {
        [PermissionFlagsBits.ViewChannel]: true,
        [PermissionFlagsBits.SendMessages]: true,
        [PermissionFlagsBits.SendMessagesInThreads]: true,
        [PermissionFlagsBits.CreatePublicThreads]: true,
        [PermissionFlagsBits.EmbedLinks]: true,
        [PermissionFlagsBits.AttachFiles]: true,
        [PermissionFlagsBits.ReadMessageHistory]: true,
        [PermissionFlagsBits.ManageThreads]: true,
        [PermissionFlagsBits.ManageMessages]: true,
        [PermissionFlagsBits.AddReactions]: true,
      }, { reason: 'Permisos del bot para publicar y mantener las Guías' });
      const old = await getGuildConfig();
      await updateGuildConfig({ guides_forum_channel_id: channel.id, updated_by: interaction.user.id });
      await recordDiscordAudit(interaction, {
        action: 'guides_forum_changed',
        description: `${interaction.member?.displayName || interaction.user.username} configuró #${channel.name} como foro oficial de Guías. Las publicaciones anteriores no se migraron automáticamente.`,
        entityType: 'discord_guides_forum', entityId: channel.id, entityName: channel.name,
        oldValue: { channel_id: old?.guides_forum_channel_id || null }, newValue: { channel_id: channel.id, channel_name: channel.name },
      });
      await interaction.editReply({ embeds: [buildSuccessEmbed('Foro de Guías configurado', `${interaction.user} configuró ${channel} como foro de Guías.${old?.guides_forum_channel_id && old.guides_forum_channel_id !== channel.id ? '\nLas publicaciones existentes permanecerán en el foro anterior.' : ''}`)] });
      return;
    }

    if (sub === 'view') {
      const cfg = await getGuildConfig();
      if (!cfg?.guides_forum_channel_id) {
        await interaction.editReply({ embeds: [buildErrorEmbed('No hay un foro configurado. Usa `/config guias set`.')] });
        return;
      }
      const channel = await interaction.guild.channels.fetch(cfg.guides_forum_channel_id).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildForum) {
        await interaction.editReply({ embeds: [buildErrorEmbed(`La configuración apunta a \`${cfg.guides_forum_channel_id}\`, pero el foro ya no existe o cambió de tipo.`)] });
        return;
      }
      const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
      const missing = missingPermissions(channel, me);
      await interaction.editReply({ embeds: [buildSuccessEmbed('Foro de Guías', `${channel}\n**ID:** \`${channel.id}\`\n**Permisos:** ${missing.length ? '⚠️ incompletos' : '✅ correctos'}\n**Etiquetas disponibles:** ${channel.availableTags.length}/20`)] });
      return;
    }

    const cfg = await getGuildConfig();
    await updateGuildConfig({ guides_forum_channel_id: null, updated_by: interaction.user.id });
    await recordDiscordAudit(interaction, {
      action: 'guides_forum_cleared',
      description: `${interaction.member?.displayName || interaction.user.username} quitó el foro predeterminado de Guías. Las publicaciones existentes permanecen en sus foros, pero no se podrán crear nuevas hasta configurar otro.`,
      entityType: 'discord_guides_forum', entityId: cfg?.guides_forum_channel_id || null,
      oldValue: { channel_id: cfg?.guides_forum_channel_id || null }, newValue: { channel_id: null },
    });
    await interaction.editReply({ embeds: [buildSuccessEmbed('Foro desconfigurado', `${interaction.user} eliminó la configuración${cfg?.guides_forum_channel_id ? ` de <#${cfg.guides_forum_channel_id}>` : ''}. Las publicaciones anteriores no se borraron.`)], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[guidesforum]', error);
    await interaction.editReply({ embeds: [buildErrorEmbed(`No se pudo actualizar el foro: ${error.message}`)] });
  }
}
