// src/events/interactionCreate.js
// Recibe todas las interacciones y las despacha al comando correspondiente.

import { Events } from 'discord.js';
import { buildErrorEmbed } from '../utils/embeds.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  // ── Autocompletado (ej: /screenshot arma nombre:<escribiendo...>) ──────
  if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command || typeof command.autocomplete !== 'function') return;
    try {
      await command.autocomplete(interaction);
    } catch (err) {
      console.error(`[Interaction] Error en autocomplete de /${interaction.commandName}:`, err);
      // Discord requiere una respuesta aunque sea vacía, o el autocompletado queda colgado.
      await interaction.respond([]).catch(() => {});
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.warn(`[Interaction] Comando desconocido: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[Interaction] Error en /${interaction.commandName}:`, err);
    const errEmbed = buildErrorEmbed('Ocurrió un error al ejecutar el comando. Intenta de nuevo.');

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ embeds: [errEmbed], ephemeral: true }).catch(() => {});
    }
  }
}
