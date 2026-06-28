// src/commands/getcode.js
// Slash command: /getcode
// Solo usuarios autorizados pueden usarlo. Envía el código por DM.

import { SlashCommandBuilder } from 'discord.js';
import { isAuthorized } from '../utils/isAuthorized.js';
import { getActiveCode } from '../services/adminCode.js';
import { buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('getcode')
  .setDescription('Obtén el código de administrador actual (solo por DM, solo autorizados)');

export async function execute(interaction) {
  // Verificar autorización
  if (!isAuthorized(interaction.user.id)) {
    await interaction.reply({
      embeds: [buildErrorEmbed('No tienes permiso para usar este comando.')],
      ephemeral: true,
    });
    return;
  }

  // Responder ephemeral inmediato para que Discord no timeout
  await interaction.deferReply({ ephemeral: true });

  const codeData = await getActiveCode();

  if (!codeData) {
    await interaction.editReply({
      embeds: [buildErrorEmbed('No hay ningún código activo. Intenta de nuevo en unos segundos.')],
    });
    return;
  }

  const expiresAt = new Date(codeData.expires_at);
  const timestamp = Math.floor(expiresAt.getTime() / 1000);

  // Intentar enviar por DM
  try {
    await interaction.user.send({
      embeds: [
        buildSuccessEmbed(
          'Código de administrador',
          [
            `\`\`\`\n${codeData.code}\n\`\`\``,
            `**Expira:** <t:${timestamp}:f> (<t:${timestamp}:R>)`,
            `⚠️ No compartas este código con nadie.`,
          ].join('\n')
        ),
      ],
    });

    await interaction.editReply({
      embeds: [buildSuccessEmbed('Código enviado', 'Te lo mandé por mensaje privado. 🔒')],
    });
  } catch {
    // El usuario puede tener DMs cerrados
    await interaction.editReply({
      embeds: [
        buildErrorEmbed(
          'No pude enviarte el DM. Asegúrate de tener los mensajes directos habilitados para miembros de este servidor.'
        ),
      ],
    });
  }
}
