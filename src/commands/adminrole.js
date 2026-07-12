import { buildErrorEmbed, buildSuccessEmbed } from '../utils/embeds.js';
import { getGuildConfig, updateGuildConfig } from '../services/botConfig.js';
import { recordDiscordAudit } from '../services/audit.js';

export async function executeAdminRole(interaction, sub) {
  try {
    if (sub === 'set') {
      const role = interaction.options.getRole('rol', true);
      if (role.id === interaction.guild.roles.everyone.id) {
        await interaction.editReply({ embeds: [buildErrorEmbed('No puedes usar @everyone como rol administrativo.')] });
        return;
      }
      if (role.managed) {
        await interaction.editReply({ embeds: [buildErrorEmbed('No puedes usar un rol administrado por un bot o una integración.')] });
        return;
      }
      const previous = await getGuildConfig();
      await updateGuildConfig({ admin_role_id: role.id, updated_by: interaction.user.id });
      await recordDiscordAudit(interaction, {
        action: 'admin_role_changed',
        description: `${interaction.member?.displayName || interaction.user.username} cambió el rol administrativo de ${previous?.admin_role_id ? `<@&${previous.admin_role_id}>` : 'ninguno'} a @${role.name}. Las cuentas con ese rol podrán activar el modo administrador en la página.`,
        entityType: 'discord_admin_role', entityId: role.id, entityName: role.name,
        oldValue: { role_id: previous?.admin_role_id || null }, newValue: { role_id: role.id, role_name: role.name },
      });
      const previousText = previous?.admin_role_id ? `<@&${previous.admin_role_id}>` : 'ninguno';
      await interaction.editReply({
        embeds: [buildSuccessEmbed('Rol administrativo configurado', `${interaction.user} cambió el rol administrativo de ${previousText} a ${role}.\n\nLas personas con este rol podrán activar el modo administrador al iniciar sesión con Discord en la página.`)],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (sub === 'view') {
      const cfg = await getGuildConfig();
      if (!cfg?.admin_role_id) {
        await interaction.editReply({ embeds: [buildErrorEmbed('Todavía no hay un rol administrativo configurado. Usa `/config admin set`.')] });
        return;
      }
      const role = await interaction.guild.roles.fetch(cfg.admin_role_id).catch(() => null);
      const status = role ? `Activo: ${role}` : `⚠️ El rol guardado (${cfg.admin_role_id}) ya no existe.`;
      await interaction.editReply({ embeds: [buildSuccessEmbed('Rol administrativo', `${status}\n**ID:** \`${cfg.admin_role_id}\``)], allowedMentions: { parse: [] } });
      return;
    }

    const confirmed = interaction.options.getBoolean('confirmar', true);
    if (!confirmed) {
      await interaction.editReply({ embeds: [buildErrorEmbed('No se eliminó el rol. Vuelve a ejecutar el comando con `confirmar: Sí` cuando estés seguro.')] });
      return;
    }
    const cfg = await getGuildConfig();
    const previous = cfg?.admin_role_id;
    await updateGuildConfig({ admin_role_id: null, updated_by: interaction.user.id });
    await recordDiscordAudit(interaction, {
      action: 'admin_role_cleared',
      description: `${interaction.member?.displayName || interaction.user.username} eliminó el rol administrativo configurado. La página quedó sin acceso administrativo hasta establecer otro rol.`,
      entityType: 'discord_admin_role', entityId: previous || null,
      oldValue: { role_id: previous || null }, newValue: { role_id: null },
    });
    await interaction.editReply({ embeds: [buildSuccessEmbed('Rol administrativo eliminado', `${interaction.user} eliminó la configuración${previous ? ` de <@&${previous}>` : ''}. Nadie podrá activar el modo administrador hasta ejecutar \`/config admin set\`.`)], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[adminrole]', error);
    await interaction.editReply({ embeds: [buildErrorEmbed(`No se pudo actualizar el rol: ${error.message}`)] });
  }
}
