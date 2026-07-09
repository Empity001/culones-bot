// src/commands/screenshot.js
//
// Subcomandos:
//   /screenshot tierlist  columna:<weapon|subweapon|accessory|todas>  [canal]
//   /screenshot guias     [filtro:<categoria|tipo>] [valor:<id>]      [canal]
//   /screenshot guia      nombre:<autocomplete>                        [canal]
//   /screenshot kits                                                   [canal]
//   /screenshot logs      [cantidad]                                   [canal]
//   /screenshot logs      ver:<id del log>                             [canal]
//
// Permisos:
//   • Cualquier miembro puede ejecutar el comando y recibir la imagen en el
//     canal donde lo escribe.
//   • La opción `canal` (redirigir a otro canal) SOLO la procesan las IDs
//     de AUTHORIZED_USER_IDS; al resto se les ignora silenciosamente y la
//     imagen se envía al canal actual.

import {
  SlashCommandBuilder,
  ChannelType,
  AttachmentBuilder,
} from 'discord.js';
import { isAuthorized }                      from '../utils/isAuthorized.js';
import { buildErrorEmbed, buildSuccessEmbed } from '../utils/embeds.js';
import { loadTierlistData, groupByRow, TIER_COLUMNS } from '../services/tierlist.js';
import { renderTierlistImage }               from '../utils/renderTierlist.js';
import { renderTierlistFullImage }           from '../utils/renderTierlistFull.js';
import { searchWeaponsByName, loadWeaponWithRanks, loadWeaponCatalog } from '../services/weapons.js';
import { renderWeaponRankImage }             from '../utils/renderWeapon.js';
import { renderWeaponCatalogImage }          from '../utils/renderWeaponCatalog.js';
import { loadKits }                          from '../services/kits.js';
import { renderKitsImage }                   from '../utils/renderKits.js';
import { loadRecentLogs, loadLogById }       from '../services/logs.js';
import { renderLogsImage }                   from '../utils/renderLogs.js';
import { renderLogDetailImage }              from '../utils/renderLogDetail.js';

// ── Definición del comando ────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName('screenshot')
  .setDescription('Genera una imagen de una sección de la web y la envía a un canal')

  // ── /screenshot tierlist ───────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('tierlist')
      .setDescription('Captura una o todas las columnas de la tierlist')
      .addStringOption((o) =>
        o.setName('columna')
          .setDescription('Columna a mostrar')
          .setRequired(true)
          .addChoices(
            { name: '⚔️  Arma',        value: 'weapon' },
            { name: '🗡️  Sub-arma',    value: 'subweapon' },
            { name: '💍  Accesorio',   value: 'accessory' },
            { name: '🖼️  Todas juntas', value: 'all' },
          )
      )
      .addChannelOption((o) =>
        o.setName('canal')
          .setDescription('Canal donde enviar (solo admins — por defecto: este canal)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )

  // ── /screenshot guias ──────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('guias')
      .setDescription('Catálogo de la sección Guías (todas las publicadas, sin specs)')
      .addStringOption((o) =>
        o.setName('filtro')
          .setDescription('Filtrar por categoría o tipo')
          .setRequired(false)
          .addChoices(
            { name: '📂 Categoría', value: 'categoria' },
            { name: '🏷️  Tipo',     value: 'tipo' },
          )
      )
      .addStringOption((o) =>
        o.setName('valor')
          .setDescription('ID de la categoría o tipo elegida (autocomplete)')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addChannelOption((o) =>
        o.setName('canal')
          .setDescription('Canal donde enviar (solo admins — por defecto: este canal)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )

  // ── /screenshot guia ───────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('guia')
      .setDescription('Ficha completa de una entrada de Guías (una imagen por rango)')
      .addStringOption((o) =>
        o.setName('nombre')
          .setDescription('Nombre del arma')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addChannelOption((o) =>
        o.setName('canal')
          .setDescription('Canal donde enviar (solo admins — por defecto: este canal)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )

  // ── /screenshot kits ───────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('kits')
      .setDescription('Kits recomendados (Arma / Accesorio / Sub-arma)')
      .addChannelOption((o) =>
        o.setName('canal')
          .setDescription('Canal donde enviar (solo admins — por defecto: este canal)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  )

  // ── /screenshot logs ───────────────────────────────────────────────────────
  .addSubcommand((sub) =>
    sub
      .setName('logs')
      .setDescription('Lista de logs recientes o detalle de uno específico')
      .addStringOption((o) =>
        o.setName('ver')
          .setDescription('Ver el contenido de un log específico (autocomplete)')
          .setRequired(false)
          .setAutocomplete(true)
      )
      .addIntegerOption((o) =>
        o.setName('cantidad')
          .setDescription('Cuántos logs mostrar en la lista (por defecto 10, máx 20)')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(false)
      )
      .addChannelOption((o) =>
        o.setName('canal')
          .setDescription('Canal donde enviar (solo admins — por defecto: este canal)')
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
  );

// ── Autocompletado ────────────────────────────────────────────────────────────
export async function autocomplete(interaction) {
  const sub     = interaction.options.getSubcommand();
  const focused = interaction.options.getFocused(true);

  // /screenshot guia nombre:...
  if (sub === 'guia' && focused.name === 'nombre') {
    const weapons = await searchWeaponsByName(focused.value);
    await interaction.respond(weapons.map((w) => ({ name: w.name.slice(0, 100), value: w.id })));
    return;
  }

  // /screenshot guias valor:... (depende de filtro)
  if (sub === 'guias' && focused.name === 'valor') {
    const tipoFiltro = interaction.options.getString('filtro');
    if (!tipoFiltro) { await interaction.respond([]); return; }

    const { categories, types } = await loadWeaponCatalog();
    if (tipoFiltro === 'categoria') {
      await interaction.respond(
        categories
          .filter(c => c.label.toLowerCase().includes(focused.value.toLowerCase()))
          .slice(0, 25)
          .map(c => ({ name: c.label, value: c.id }))
      );
    } else {
      await interaction.respond(
        types
          .filter(t => t.label.toLowerCase().includes(focused.value.toLowerCase()))
          .slice(0, 25)
          .map(t => ({ name: t.label, value: t.id }))
      );
    }
    return;
  }

  // /screenshot logs ver:...
  if (sub === 'logs' && focused.name === 'ver') {
    const logs = await loadRecentLogs(20);
    const q    = focused.value.toLowerCase();
    await interaction.respond(
      logs
        .filter(l => l.title.toLowerCase().includes(q))
        .slice(0, 25)
        .map(l => ({ name: l.title.slice(0, 100), value: l.id }))
    );
    return;
  }

  await interaction.respond([]);
}

// ── Handler principal ─────────────────────────────────────────────────────────
export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'tierlist') return handleTierlist(interaction);
  if (sub === 'guias')    return handleWeaponCatalog(interaction);
  if (sub === 'guia')     return handleWeapon(interaction);
  if (sub === 'kits')     return handleKits(interaction);
  if (sub === 'logs')     return handleLogs(interaction);
}

// ── Helpers de permiso ────────────────────────────────────────────────────────

/**
 * Resuelve el canal destino.
 * Si el usuario pasó `canal` pero NO está autorizado, ignora la opción
 * silenciosamente y devuelve el canal actual (sin error visible).
 */
function resolveTargetChannel(interaction) {
  const requested = interaction.options.getChannel('canal');
  if (!requested) return interaction.channel;
  if (isAuthorized(interaction.user.id)) return requested;
  // Usuario normal intentó usar `canal` → lo ignoramos, canal actual
  return interaction.channel;
}

async function checkChannelPerms(interaction, targetChannel) {
  const perms = targetChannel.permissionsFor(interaction.guild.members.me);
  if (!perms?.has('SendMessages') || !perms?.has('AttachFiles')) {
    await interaction.editReply({
      embeds: [buildErrorEmbed(`No tengo permisos para enviar archivos en ${targetChannel}.`)],
    });
    return false;
  }
  return true;
}

// ── /screenshot tierlist ──────────────────────────────────────────────────────
async function handleTierlist(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const columnKey     = interaction.options.getString('columna');
  const targetChannel = resolveTargetChannel(interaction);

  if (!(await checkChannelPerms(interaction, targetChannel))) return;

  try {
    const tierlistData = await loadTierlistData();
    const { rows, items } = tierlistData;

    if (rows.length === 0) {
      await interaction.editReply({
        embeds: [buildErrorEmbed('La tierlist está vacía. Agrega filas desde la web primero.')],
      });
      return;
    }

    // Modo "todas": 3 columnas en una imagen
    if (columnKey === 'all') {
      const pngBuffer  = await renderTierlistFullImage(tierlistData, interaction.guild.name);
      const attachment = new AttachmentBuilder(pngBuffer, { name: `tierlist-completa-${Date.now()}.png` });

      await targetChannel.send({
        content: '📊 **TIERLIST COMPLETA** · Arma / Sub-arma / Accesorio',
        files:   [attachment],
      });
      await interaction.editReply({
        embeds: [buildSuccessEmbed('Imagen enviada', `La tierlist completa (3 columnas) fue enviada a ${targetChannel}. 🖼️`)],
      });
      return;
    }

    // Modo columna individual (comportamiento original)
    const column  = TIER_COLUMNS.find((c) => c.key === columnKey);
    const grouped = groupByRow(rows, items, columnKey);
    const pngBuffer  = await renderTierlistImage(grouped, column.label, interaction.guild.name);
    const attachment = new AttachmentBuilder(pngBuffer, { name: `tierlist-${columnKey}-${Date.now()}.png` });

    await targetChannel.send({
      content: `📊 **TIERLIST · ${column.label.toUpperCase()}**`,
      files:   [attachment],
    });
    await interaction.editReply({
      embeds: [buildSuccessEmbed('Imagen enviada', `La tierlist de **${column.label}** fue enviada a ${targetChannel}. 🖼️`)],
    });

  } catch (err) {
    console.error('[screenshot:tierlist]', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(`Error generando la imagen: ${err.message}`)],
    });
  }
}

// ── /screenshot guias ─────────────────────────────────────────────────────────
async function handleWeaponCatalog(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const targetChannel = resolveTargetChannel(interaction);
  const tipoFiltro    = interaction.options.getString('filtro');
  const valorFiltro   = interaction.options.getString('valor');

  if (!(await checkChannelPerms(interaction, targetChannel))) return;

  try {
    const filters = {};
    let filterLabel = 'Todas';

    if (tipoFiltro && valorFiltro) {
      if (tipoFiltro === 'categoria') filters.categoryId = valorFiltro;
      if (tipoFiltro === 'tipo')      filters.typeId     = valorFiltro;
    }

    const { weapons, categories, types } = await loadWeaponCatalog(filters);

    // Resolver etiqueta del filtro para el header de la imagen
    if (tipoFiltro === 'categoria' && valorFiltro) {
      const cat = categories.find(c => c.id === valorFiltro);
      if (cat) filterLabel = `Categoría: ${cat.label}`;
    } else if (tipoFiltro === 'tipo' && valorFiltro) {
      const tipo = types.find(t => t.id === valorFiltro);
      if (tipo) filterLabel = `Tipo: ${tipo.label}`;
    }

    const pngBuffer  = await renderWeaponCatalogImage(weapons, filterLabel, interaction.guild.name);
    const attachment = new AttachmentBuilder(pngBuffer, { name: `armas-catalogo-${Date.now()}.png` });

    await targetChannel.send({
      content: `⚔️ **GUÍAS · CATÁLOGO** · ${filterLabel} (${weapons.length} arma${weapons.length !== 1 ? 's' : ''})`,
      files:   [attachment],
    });
    await interaction.editReply({
      embeds: [buildSuccessEmbed(
        'Imagen enviada',
        `El catálogo de Guías (${filterLabel}, ${weapons.length} arma${weapons.length !== 1 ? 's' : ''}) fue enviado a ${targetChannel}. 🖼️`,
      )],
    });

  } catch (err) {
    console.error('[screenshot:guias]', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(`Error generando el catálogo: ${err.message}`)],
    });
  }
}

// ── /screenshot guia ───────────────────────────────────────────────────────────
async function handleWeapon(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const weaponId      = interaction.options.getString('nombre');
  const targetChannel = resolveTargetChannel(interaction);

  if (!(await checkChannelPerms(interaction, targetChannel))) return;

  try {
    const { weapon, category, type, ranks } = await loadWeaponWithRanks(weaponId);

    if (!weapon) {
      await interaction.editReply({
        embeds: [buildErrorEmbed('No se encontró esa arma. Elige una opción de la lista de autocompletado.')],
      });
      return;
    }

    if (ranks.length === 0) {
      await interaction.editReply({
        embeds: [buildErrorEmbed(`**${weapon.name}** no tiene rangos configurados todavía.`)],
      });
      return;
    }

    const attachments = [];
    for (const rank of ranks) {
      const pngBuffer = await renderWeaponRankImage({ weapon, category, type, rank });
      attachments.push(new AttachmentBuilder(pngBuffer, { name: `arma-${weapon.id}-${rank.id}.png` }));
    }

    await targetChannel.send({
      content: `⚔️ **GUÍAS · ${weapon.name.toUpperCase()}** · ${ranks.length} rango${ranks.length > 1 ? 's' : ''}`,
      files:   attachments,
    });
    await interaction.editReply({
      embeds: [buildSuccessEmbed(
        'Imágenes enviadas',
        `La ficha de **${weapon.name}** (${ranks.length} rango${ranks.length > 1 ? 's' : ''}) fue enviada a ${targetChannel}. 🖼️`,
      )],
    });

  } catch (err) {
    console.error('[screenshot:guia]', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(`Error generando la imagen: ${err.message}`)],
    });
  }
}

// ── /screenshot kits ───────────────────────────────────────────────────────────
async function handleKits(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const targetChannel = resolveTargetChannel(interaction);

  if (!(await checkChannelPerms(interaction, targetChannel))) return;

  try {
    const kits = await loadKits();

    const pngBuffer  = await renderKitsImage(kits, interaction.guild.name);
    const attachment = new AttachmentBuilder(pngBuffer, { name: `kits-${Date.now()}.png` });

    await targetChannel.send({
      content: `🎒 **KITS RECOMENDADOS** (${kits.length} kit${kits.length !== 1 ? 's' : ''})`,
      files:   [attachment],
    });
    await interaction.editReply({
      embeds: [buildSuccessEmbed(
        'Imagen enviada',
        `Los kits recomendados (${kits.length}) fueron enviados a ${targetChannel}. 🖼️`,
      )],
    });

  } catch (err) {
    console.error('[screenshot:kits]', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(`Error generando la imagen: ${err.message}`)],
    });
  }
}

// ── /screenshot logs ──────────────────────────────────────────────────────────
async function handleLogs(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const targetChannel = resolveTargetChannel(interaction);
  const logId         = interaction.options.getString('ver');
  const limit         = interaction.options.getInteger('cantidad') ?? 10;

  if (!(await checkChannelPerms(interaction, targetChannel))) return;

  try {
    // Modo "ver log específico"
    if (logId) {
      const log       = await loadLogById(logId);
      const pngBuffer = renderLogDetailImage(log, interaction.guild.name);
      const attachment = new AttachmentBuilder(pngBuffer, { name: `log-${log.id}-${Date.now()}.png` });

      await targetChannel.send({
        content: `📜 **LOG · ${log.title.toUpperCase()}**`,
        files:   [attachment],
      });
      await interaction.editReply({
        embeds: [buildSuccessEmbed('Imagen enviada', `El detalle del log **${log.title}** fue enviado a ${targetChannel}. 🖼️`)],
      });
      return;
    }

    // Modo lista reciente (comportamiento original)
    const logs       = await loadRecentLogs(limit);
    const pngBuffer  = renderLogsImage(logs, interaction.guild.name);
    const attachment = new AttachmentBuilder(pngBuffer, { name: `logs-${Date.now()}.png` });

    await targetChannel.send({
      content: `📜 **LOGS RECIENTES** (últimos ${logs.length})`,
      files:   [attachment],
    });
    await interaction.editReply({
      embeds: [buildSuccessEmbed('Imagen enviada', `La lista de logs fue enviada a ${targetChannel}. 🖼️`)],
    });

  } catch (err) {
    console.error('[screenshot:logs]', err);
    await interaction.editReply({
      embeds: [buildErrorEmbed(`Error generando la imagen: ${err.message}`)],
    });
  }
}
