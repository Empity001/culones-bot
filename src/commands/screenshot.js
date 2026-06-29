// src/commands/screenshot.js
// /screenshot tierlist columna:Arma [canal]
// /screenshot logs [cantidad] [canal]
// /screenshot arma nombre:<autocompletado> [canal]
//
// Comando unificado para capturar cualquier sección de la web
// como imagen y enviarla a un canal de Discord. Reemplaza al
// antiguo /sendtierlist (la opción "tierlist" hace lo mismo).
// Solo usuarios autorizados (isAuthorized) pueden usarlo.

import { SlashCommandBuilder, ChannelType, AttachmentBuilder } from 'discord.js';
import { isAuthorized } from '../utils/isAuthorized.js';
import { buildErrorEmbed, buildSuccessEmbed } from '../utils/embeds.js';
import { loadTierlistData, groupByRow, TIER_COLUMNS } from '../services/tierlist.js';
import { renderTierlistImage } from '../utils/renderTierlist.js';
import { searchWeaponsByName, loadWeaponWithRanks } from '../services/weapons.js';
import { renderWeaponRankImage } from '../utils/renderWeapon.js';
import { loadRecentLogs } from '../services/logs.js';
import { renderLogsImage } from '../utils/renderLogs.js';

export const data = new SlashCommandBuilder()
  .setName('screenshot')
  .setDescription('Genera una imagen de una sección de la web y la envía a un canal (solo admins)')
  .addSubcommand((sub) =>
    sub
      .setName('tierlist')
      .setDescription('Captura una columna de la tierlist')
      .addStringOption((option) =>
        option
          .setName('columna')
          .setDescription('Columna de la tierlist a mostrar')
          .setRequired(true)
          .addChoices(
            { name: '⚔️  Arma', value: 'weapon' },
            { name: '🗡️  Sub-arma', value: 'subweapon' },
            { name: '💍  Accesorio', value: 'accessory' }
          )
      )
      .addChannelOption((option) =>
        option
          .setName('canal')
          .setDescription('Canal donde enviar la imagen (por defecto: el canal actual)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('logs')
      .setDescription('Captura la lista de logs más recientes')
      .addIntegerOption((option) =>
        option
          .setName('cantidad')
          .setDescription('Cuántos logs mostrar (por defecto 10, máximo 20)')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(false)
      )
      .addChannelOption((option) =>
        option
          .setName('canal')
          .setDescription('Canal donde enviar la imagen (por defecto: el canal actual)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('arma')
      .setDescription('Captura la ficha completa de un arma (una imagen por cada rango)')
      .addStringOption((option) =>
        option
          .setName('nombre')
          .setDescription('Nombre del arma')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addChannelOption((option) =>
        option
          .setName('canal')
          .setDescription('Canal donde enviar las imágenes (por defecto: el canal actual)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  );

// ── Autocompletado (solo aplica a la opción "nombre" del subcomando "arma") ──
export async function autocomplete(interaction) {
  // No revelamos nombres de armas a quien no esté autorizado:
  // el autocompletado también respeta el filtro de admins.
  if (!isAuthorized(interaction.user.id)) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused();
  const weapons = await searchWeaponsByName(focused);
  await interaction.respond(
    weapons.map((w) => ({ name: w.name.slice(0, 100), value: w.id }))
  );
}

export async function execute(interaction) {
  if (!isAuthorized(interaction.user.id)) {
    await interaction.reply({
      embeds: [buildErrorEmbed('No tienes permiso para usar este comando.')],
      ephemeral: true,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'tierlist') return handleTierlist(interaction);
  if (sub === 'logs') return handleLogs(interaction);
  if (sub === 'arma') return handleWeapon(interaction);
}

// ── /screenshot tierlist ─────────────────────────────────────────────────
async function handleTierlist(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const columnKey = interaction.options.getString('columna');
  const targetChannel = interaction.options.getChannel('canal') ?? interaction.channel;
  const column = TIER_COLUMNS.find((c) => c.key === columnKey);

  if (!(await checkChannelPerms(interaction, targetChannel))) return;

  try {
    const { rows, items } = await loadTierlistData();

    if (rows.length === 0) {
      await interaction.editReply({ embeds: [buildErrorEmbed('La tierlist está vacía. Agrega filas desde la web primero.')] });
      return;
    }

    const grouped = groupByRow(rows, items, columnKey);
    const pngBuffer = await renderTierlistImage(grouped, column.label, interaction.guild.name);
    const attachment = new AttachmentBuilder(pngBuffer, { name: `tierlist-${columnKey}-${Date.now()}.png` });

    await targetChannel.send({ content: `📊 **TIERLIST · ${column.label.toUpperCase()}**`, files: [attachment] });
    await interaction.editReply({ embeds: [buildSuccessEmbed('Imagen enviada', `La tierlist de **${column.label}** fue enviada a ${targetChannel}. 🖼️`)] });
  } catch (err) {
    console.error('[screenshot:tierlist]', err);
    await interaction.editReply({ embeds: [buildErrorEmbed(`Error generando la imagen: ${err.message}`)] });
  }
}

// ── /screenshot logs ─────────────────────────────────────────────────────
async function handleLogs(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const limit = interaction.options.getInteger('cantidad') ?? 10;
  const targetChannel = interaction.options.getChannel('canal') ?? interaction.channel;

  if (!(await checkChannelPerms(interaction, targetChannel))) return;

  try {
    const logs = await loadRecentLogs(limit);
    const pngBuffer = renderLogsImage(logs, interaction.guild.name);
    const attachment = new AttachmentBuilder(pngBuffer, { name: `logs-${Date.now()}.png` });

    await targetChannel.send({ content: `📜 **LOGS RECIENTES** (últimos ${logs.length})`, files: [attachment] });
    await interaction.editReply({ embeds: [buildSuccessEmbed('Imagen enviada', `La lista de logs fue enviada a ${targetChannel}. 🖼️`)] });
  } catch (err) {
    console.error('[screenshot:logs]', err);
    await interaction.editReply({ embeds: [buildErrorEmbed(`Error generando la imagen: ${err.message}`)] });
  }
}

// ── /screenshot arma ──────────────────────────────────────────────────────
async function handleWeapon(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const weaponId = interaction.options.getString('nombre');
  const targetChannel = interaction.options.getChannel('canal') ?? interaction.channel;

  if (!(await checkChannelPerms(interaction, targetChannel))) return;

  try {
    const { weapon, category, type, ranks } = await loadWeaponWithRanks(weaponId);

    if (!weapon) {
      await interaction.editReply({ embeds: [buildErrorEmbed('No se encontró esa arma. Vuelve a escribir el nombre y elige una opción de la lista.')] });
      return;
    }

    if (ranks.length === 0) {
      await interaction.editReply({ embeds: [buildErrorEmbed(`**${weapon.name}** no tiene rangos configurados todavía.`)] });
      return;
    }

    // Una imagen POR CADA rango, todas en el mismo mensaje
    const attachments = [];
    for (const rank of ranks) {
      const pngBuffer = await renderWeaponRankImage({ weapon, category, type, rank });
      attachments.push(new AttachmentBuilder(pngBuffer, { name: `arma-${weapon.id}-${rank.id}.png` }));
    }

    await targetChannel.send({
      content: `⚔️ **${weapon.name.toUpperCase()}** · ${ranks.length} rango${ranks.length > 1 ? 's' : ''}`,
      files: attachments,
    });

    await interaction.editReply({
      embeds: [buildSuccessEmbed('Imágenes enviadas', `La ficha completa de **${weapon.name}** (${ranks.length} rango${ranks.length > 1 ? 's' : ''}) fue enviada a ${targetChannel}. 🖼️`)],
    });
  } catch (err) {
    console.error('[screenshot:arma]', err);
    await interaction.editReply({ embeds: [buildErrorEmbed(`Error generando la imagen: ${err.message}`)] });
  }
}

// ── Helper compartido ──────────────────────────────────────────────────────
async function checkChannelPerms(interaction, targetChannel) {
  const perms = targetChannel.permissionsFor(interaction.guild.members.me);
  if (!perms?.has('SendMessages') || !perms?.has('AttachFiles')) {
    await interaction.editReply({ embeds: [buildErrorEmbed(`No tengo permisos para enviar archivos en ${targetChannel}.`)] });
    return false;
  }
  return true;
}
