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

// Límite real de Discord por valor de campo de embed.
const EMBED_FIELD_VALUE_LIMIT = 1024;

/**
 * Un bloque libre guarda su lista de campos (con sub-campos
 * anidables opcionales) como JSON dentro de `obtained_from`,
 * igual que en la web. Si el JSON es inválido o está vacío,
 * devuelve un array vacío en vez de explotar.
 */
function parseLibreFields(item) {
  if (!item?.obtained_from) return [];
  try {
    const parsed = JSON.parse(item.obtained_from);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Arma el texto completo (sin resumir) de un bloque libre: cada
 * campo en su propia línea, con sub-campos indentados debajo, más
 * descripción e imagen de referencia si las tiene. A diferencia de
 * mobs/items, los bloques libres se muestran enteros porque su
 * gracia es justamente poder llevar cualquier información custom
 * que el admin haya decidido agregar.
 */
function formatLibreBlockValue(libre) {
  const lines = [];
  const fields = parseLibreFields(libre);

  fields.forEach((field) => {
    if (!field?.key) return;
    if (field.value) lines.push(`**${field.key}:** ${field.value}`);
    else lines.push(`**${field.key}**`);

    (field.subfields || []).forEach((sub) => {
      if (!sub?.key) return;
      lines.push(`> ↳ **${sub.key}:** ${sub.value ?? ''}`);
    });
  });

  if (libre.description) {
    lines.push(`*${libre.description}*`);
  }
  if (libre.image_url) {
    lines.push(`[🖼 Ver imagen de referencia](${libre.image_url})`);
  }

  if (lines.length === 0) return '_Sin campos._';

  let value = lines.join('\n');
  if (value.length > EMBED_FIELD_VALUE_LIMIT) {
    value = `${value.slice(0, EMBED_FIELD_VALUE_LIMIT - 1)}…`;
  }
  return value;
}

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

  // Bloques libres — a diferencia de mobs/items, se muestran
  // COMPLETOS (no resumidos): un campo de embed por bloque, con
  // todos sus campos/sub-campos, descripción e imagen si las tiene.
  // Se limita la cantidad de campos por seguridad: Discord permite
  // un máximo de 25 campos por embed (3 fijos + mobs + items ya
  // ocupan hasta 5, así que dejamos margen de sobra).
  const MAX_LIBRE_FIELDS = 19;
  const libres = items.filter((i) => i.item_type === '_libre');
  libres.slice(0, MAX_LIBRE_FIELDS).forEach((libre) => {
    embed.addFields({
      name: `📋 ${libre.name}`,
      value: formatLibreBlockValue(libre),
      inline: false,
    });
  });
  if (libres.length > MAX_LIBRE_FIELDS) {
    embed.addFields({
      name: '📋 …',
      value: `+${libres.length - MAX_LIBRE_FIELDS} bloque(s) libre(s) más — consulta la web para verlos todos.`,
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
