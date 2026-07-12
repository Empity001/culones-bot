import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { executeAdminRole } from '../command-handlers/adminrole.js';
import { executeGuidesForum } from '../command-handlers/guidesforum.js';
import { executeLogChannel } from '../command-handlers/setlogchannel.js';
import { buildErrorEmbed } from '../utils/embeds.js';
import { requireOwnerOrAdministrator } from '../utils/permissions.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Configuración administrativa del bot y la página')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommandGroup(group => group
    .setName('guias')
    .setDescription('Configura el foro de Guías')
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Configura el foro de Guías')
      .addChannelOption(option => option.setName('canal').setDescription('Canal de tipo Foro').addChannelTypes(ChannelType.GuildForum).setRequired(true)))
    .addSubcommand(sub => sub.setName('view').setDescription('Muestra el foro configurado y comprueba permisos'))
    .addSubcommand(sub => sub.setName('clear').setDescription('Deja de usar el foro configurado')))
  .addSubcommandGroup(group => group
    .setName('logs')
    .setDescription('Configura el canal de Logs')
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Configura el canal donde se anuncian los Logs')
      .addChannelOption(option => option.setName('canal').setDescription('Canal de texto para los Logs').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(sub => sub.setName('view').setDescription('Muestra el canal de Logs configurado'))
    .addSubcommand(sub => sub.setName('clear').setDescription('Deja de usar el canal de Logs configurado')))
  .addSubcommandGroup(group => group
    .setName('admin')
    .setDescription('Configura el rol administrativo de la web')
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Configura o reemplaza el rol administrativo')
      .addRoleOption(option => option.setName('rol').setDescription('Rol que podrá administrar la página').setRequired(true)))
    .addSubcommand(sub => sub.setName('view').setDescription('Muestra el rol administrativo configurado'))
    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Elimina el rol administrativo configurado')
      .addBooleanOption(option => option.setName('confirmar').setDescription('Confirma que la web quedará sin administradores').setRequired(true))));

const handlers = {
  guias: executeGuidesForum,
  logs: executeLogChannel,
  admin: executeAdminRole,
};

export async function execute(interaction) {
  if (!(await requireOwnerOrAdministrator(interaction, buildErrorEmbed))) return;

  await interaction.deferReply({ ephemeral: true });
  const group = interaction.options.getSubcommandGroup(true);
  const subcommand = interaction.options.getSubcommand(true);
  await handlers[group](interaction, subcommand);
}
