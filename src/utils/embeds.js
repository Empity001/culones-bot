// src/utils/embeds.js
// Construye los embeds de Discord para los distintos tipos de notificación.

import { EmbedBuilder, Colors } from 'discord.js';

// Colores según relevancia
const RELEVANCE_COLOR = {
  low: 0x9a92b8,       // gris violeta
  normal: 0x4dd4e8,    // cyan
  high: 0xf5c542,      // dorado
  critical: 0xe84d4d,  // rojo
};

const RELEVANCE_LABEL = {
  low: '⚪ Baja',
  normal: '🔵 Normal',
  high: '🟡 Alta',
  critical: '🔴 Crítica',
};

const CATEGORY_EMOJI = {
  mobs: '👾',
  items: '🗡️',
  bloques: '🧱',
  npcs: '🧑',
  quest: '📜',
  evento: '🎉',
};

/**
 * Crea el embed para un nuevo log del juego.
 * @param {object} log - fila de la tabla logs
 * @param {object} category - fila de la tabla categories
 * @param {Array}  mobs  - mobs relacionados
 * @param {Array}  items - items relacionados
 * @param {string} siteUrl - URL base de la web
 */
export function buildLogEmbed(log, category, mobs = [], items = [], siteUrl = '') {
  const color = RELEVANCE_COLOR[log.relevance] ?? Colors.Blurple;
  const catEmoji = category?.emoji ?? CATEGORY_EMOJI[log.category] ?? '📋';
  const catLabel = category?.label ?? log.category;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${catEmoji} ${log.title}`)
    .setDescription(log.description || 'Sin descripción.')
    .addFields(
      {
        name: '📂 Categoría',
        value: `${catEmoji} ${catLabel}`,
        inline: true,
      },
      {
        name: '⚡ Relevancia',
        value: RELEVANCE_LABEL[log.relevance] ?? log.relevance,
        inline: true,
      },
      {
        name: '📅 Fecha',
        value: `<t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:f>`,
        inline: true,
      }
    )
    .setTimestamp(new Date(log.created_at))
    .setFooter({ text: 'Culones RPG · Sistema de Logs' });

  // Mobs
  if (mobs.length > 0) {
    const mobLines = mobs.map((m) => {
      const parts = [`**${m.name}**`];
      if (m.health != null) parts.push(`❤️ ${m.health} HP`);
      if (m.damage != null) parts.push(`⚔️ ${m.damage} DMG`);
      if (m.armor != null) parts.push(`🛡️ ${m.armor} ARM`);
      if (m.location) parts.push(`📍 ${m.location}`);
      return parts.join(' · ');
    });
    embed.addFields({
      name: `👾 Mobs (${mobs.length})`,
      value: mobLines.join('\n'),
      inline: false,
    });
  }

  // Items normales (excluye libres)
  const normalItems = items.filter((i) => i.item_type !== '_libre');
  if (normalItems.length > 0) {
    const itemLines = normalItems.map((i) => {
      const parts = [`**${i.name}**`];
      if (i.item_type) parts.push(i.item_type);
      if (i.tier) parts.push(`Tier ${i.tier}`);
      return parts.join(' · ');
    });
    embed.addFields({
      name: `🗡️ Items (${normalItems.length})`,
      value: itemLines.join('\n'),
      inline: false,
    });
  }

  // Bloques libres
  const libres = items.filter((i) => i.item_type === '_libre');
  if (libres.length > 0) {
    embed.addFields({
      name: `📋 Bloques libres`,
      value: libres.map((l) => `• ${l.name}`).join('\n'),
      inline: false,
    });
  }

  // Enlace a la web (si está configurado)
  if (siteUrl) {
    embed.setURL(siteUrl);
  }

  return embed;
}

/**
 * Embed de confirmación genérico (éxito).
 */
export function buildSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(0x4dd4e8)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

/**
 * Embed de error genérico.
 */
export function buildErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor(0xe84d4d)
    .setTitle('❌ Error')
    .setDescription(description)
    .setTimestamp();
}
