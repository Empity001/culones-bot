import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from '../services/botConfig.js';
import { config } from '../config.js';

export function isOfficialGuild(guildId) {
  return Boolean(guildId && guildId === config.discord.guildId);
}

export function isOwnerOrAdministrator(interaction) {
  if (!interaction.guild || !isOfficialGuild(interaction.guild.id)) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

export async function getConfiguredAdminRoleId() {
  const cfg = await getGuildConfig().catch(() => null);
  return cfg?.admin_role_id || null;
}

export async function memberHasConfiguredAdminRole(guild, userId) {
  if (!guild || !isOfficialGuild(guild.id) || !userId) return false;
  const roleId = await getConfiguredAdminRoleId();
  if (!roleId) return false;
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  return Boolean(member?.roles?.cache?.has(roleId));
}

export async function canUseAdminFeature(interaction) {
  if (isOwnerOrAdministrator(interaction)) return true;
  return memberHasConfiguredAdminRole(interaction.guild, interaction.user.id);
}

export async function requireOwnerOrAdministrator(interaction, errorEmbedFactory) {
  if (isOwnerOrAdministrator(interaction)) return true;
  const payload = {
    content: errorEmbedFactory ? undefined : 'No tienes permiso para usar este comando.',
    embeds: errorEmbedFactory ? [errorEmbedFactory('Solo el propietario del servidor o alguien con el permiso Administrador puede usar este comando.')] : undefined,
    ephemeral: true,
  };
  if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
  return false;
}
