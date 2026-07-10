// src/utils/logEmbeds.js
// =========================================================
// Construcción de embeds paginados para publicación de logs.
//
// ARQUITECTURA:
//   - buildLogSummaryEmbed()  → embed del canal principal (resumen)
//   - buildLogPageEmbeds()    → array de embeds para el hilo
//
// LÍMITES DISCORD (reales):
//   title       ≤ 256 chars
//   description ≤ 4096 chars
//   fields      ≤ 25 por embed
//   field.name  ≤ 256 chars
//   field.value ≤ 1024 chars
//   total embed ≤ 6000 chars (combinado)
//
// Usamos márgenes seguros para no chocar con el límite real.
// =========================================================

import { EmbedBuilder } from 'discord.js';
import { parseLibreFields, splitItems } from './libreFields.js';

// ── Colores por relevancia ────────────────────────────────────────────────────
const RELEVANCE_COLOR = {
  low:      0x9a92b8,
  normal:   0x4dd4e8,
  high:     0xf5c542,
  critical: 0xe84d4d,
};

const RELEVANCE_LABEL = {
  low:      '⚪ Baja',
  normal:   '🔵 Normal',
  high:     '🟡 Alta',
  critical: '🔴 Crítica',
};

// ── Límites con margen de seguridad ─────────────────────────────────────────
const SAFE_EMBED_CHARS    = 5200;  // margen real bajo el límite de 6000
const SAFE_DESCRIPTION    = 3800;  // bajo el real de 4096
const SAFE_FIELD_VALUE    = 990;   // bajo el real de 1024
const SAFE_FIELD_NAME     = 230;   // bajo el real de 256
const SAFE_TITLE          = 230;   // bajo el real de 256
const MAX_FIELDS_PER_EMBED = 24;   // bajo el real de 25

// ── Helpers de texto ─────────────────────────────────────────────────────────

/** Corta en el último espacio antes de `max` para no partir palabras. */
function splitAtWord(text, max) {
  if (text.length <= max) return [text, ''];
  let cut = max;
  while (cut > 0 && text[cut] !== ' ' && text[cut] !== '\n') cut--;
  if (cut === 0) cut = max; // sin espacios: corte duro
  return [text.slice(0, cut).trimEnd(), text.slice(cut).trimStart()];
}

/** Divide un texto largo en chunks de tamaño `max`. */
export function splitTextIntoChunks(text, max = SAFE_DESCRIPTION) {
  const chunks = [];
  let remaining = String(text ?? '').trim();
  while (remaining.length > max) {
    const [chunk, rest] = splitAtWord(remaining, max);
    chunks.push(chunk);
    remaining = rest;
  }
  if (remaining) chunks.push(remaining);
  return chunks.length ? chunks : [''];
}

/**
 * Divide un valor de campo que supera SAFE_FIELD_VALUE en varios
 * "subcampos" con nombres de continuación.
 * @param {string} name   - nombre base del campo
 * @param {string} value  - valor completo (puede ser muy largo)
 * @returns {Array<{name, value}>}
 */
export function splitFieldValue(name, value) {
  const safeName = truncate(name, SAFE_FIELD_NAME);
  const chunks   = splitTextIntoChunks(String(value ?? ''), SAFE_FIELD_VALUE);
  return chunks.map((chunk, i) => ({
    name:  i === 0 ? safeName : truncate(`${name} — continuación ${i + 1}`, SAFE_FIELD_NAME),
    value: chunk || '\u200B',
  }));
}

function truncate(str, max, suffix = '…') {
  const s = String(str ?? '').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - suffix.length).trimEnd() + suffix;
}

/** Suma los caracteres reales que Discord contabiliza en un embed. */
export function getEmbedCharCount(embed) {
  const d = embed.data;
  let total = 0;
  if (d.title)       total += d.title.length;
  if (d.description) total += d.description.length;
  if (d.footer?.text) total += d.footer.text.length;
  if (d.author?.name) total += d.author.name.length;
  for (const f of d.fields ?? []) {
    total += (f.name?.length ?? 0) + (f.value?.length ?? 0);
  }
  return total;
}

/**
 * Verifica que un embed no supere ningún límite.
 * Lanza Error si algo está mal (para detectarlo en desarrollo).
 */
export function validateEmbed(embed, pageLabel = '') {
  const d = embed.data;
  const errors = [];

  if ((d.title?.length ?? 0) > 256)       errors.push(`title > 256 (${d.title?.length})`);
  if ((d.description?.length ?? 0) > 4096) errors.push(`description > 4096 (${d.description?.length})`);
  if ((d.fields?.length ?? 0) > 25)        errors.push(`fields > 25 (${d.fields?.length})`);
  for (const f of d.fields ?? []) {
    if ((f.name?.length ?? 0) > 256)   errors.push(`field.name > 256: "${f.name?.slice(0, 30)}"`);
    if ((f.value?.length ?? 0) > 1024) errors.push(`field.value > 1024 en "${f.name?.slice(0, 30)}"`);
  }
  const total = getEmbedCharCount(embed);
  if (total > 6000) errors.push(`total embed > 6000 (${total})`);

  if (errors.length) {
    throw new Error(`[logEmbeds] Embed inválido${pageLabel ? ` (${pageLabel})` : ''}: ${errors.join('; ')}`);
  }
}

// ── PageBuilder: acumula campos y genera embeds automáticamente ──────────────

class PageBuilder {
  constructor(color, footerBase, totalPagesHint = '?') {
    this._color         = color;
    this._footerBase    = footerBase;
    this._totalHint     = totalPagesHint;
    this._pages         = [];       // array de EmbedBuilder terminados
    this._currentFields = [];
    this._currentDesc   = null;
    this._currentTitle  = null;
    this._charCount     = 0;
  }

  /** Empieza una nueva página y cierra la anterior si la hay. */
  _newPage(title = null, description = null) {
    this._flush();
    this._currentTitle  = title  ? truncate(title, SAFE_TITLE) : null;
    this._currentDesc   = description;
    this._currentFields = [];
    this._charCount     = 0;
    if (this._currentTitle)  this._charCount += this._currentTitle.length;
    if (this._currentDesc)   this._charCount += this._currentDesc.length;
  }

  /** Guarda la página en progreso si tiene contenido. */
  _flush() {
    if (this._currentFields.length === 0 && !this._currentDesc) return;

    const embed = new EmbedBuilder().setColor(this._color);
    if (this._currentTitle) embed.setTitle(this._currentTitle);
    if (this._currentDesc)  embed.setDescription(this._currentDesc);
    if (this._currentFields.length) embed.addFields(this._currentFields);
    // Footer con número de página se asigna después (cuando sabemos el total)
    embed.setFooter({ text: this._footerBase });

    this._pages.push(embed);
    this._currentFields = [];
    this._currentDesc   = null;
    this._currentTitle  = null;
    this._charCount     = 0;
  }

  /**
   * Agrega un campo (name+value). Si no cabe en la página actual,
   * cierra la página y abre una nueva automáticamente.
   * El campo puede dividirse en subcampos si value > SAFE_FIELD_VALUE.
   */
  addField(name, value, sectionTitle = null) {
    const subfields = splitFieldValue(name, value);

    for (const sf of subfields) {
      const needed = sf.name.length + sf.value.length;

      const wouldOverflowChars  = this._charCount + needed > SAFE_EMBED_CHARS;
      const wouldOverflowFields = this._currentFields.length >= MAX_FIELDS_PER_EMBED;

      if ((wouldOverflowChars || wouldOverflowFields) && this._currentFields.length > 0) {
        this._flush();
        if (sectionTitle) {
          this._currentTitle = truncate(`${sectionTitle} (cont.)`, SAFE_TITLE);
          this._charCount   += this._currentTitle.length;
        }
      }

      this._currentFields.push({ name: sf.name, value: sf.value, inline: false });
      this._charCount += needed;
    }
  }

  /**
   * Agrega un bloque de descripción larga (múltiples chunks si supera el límite).
   * Cada chunk va en su propia página con descripción.
   */
  addDescription(text, pageTitle = null) {
    const chunks = splitTextIntoChunks(text, SAFE_DESCRIPTION);
    for (let i = 0; i < chunks.length; i++) {
      const title = i === 0 ? pageTitle : (pageTitle ? `${pageTitle} (cont.)` : null);
      this._flush();
      this._currentTitle = title ? truncate(title, SAFE_TITLE) : null;
      this._currentDesc  = chunks[i];
      this._charCount   = (this._currentTitle?.length ?? 0) + chunks[i].length;
    }
  }

  /**
   * Fuerza una nueva página con título opcional.
   * Útil para separar secciones visualmente.
   */
  newSection(title = null) {
    this._flush();
    if (title) {
      this._currentTitle = truncate(title, SAFE_TITLE);
      this._charCount   += this._currentTitle.length;
    }
  }

  /** Retorna el array final de EmbedBuilders con footers numerados. */
  build() {
    this._flush();
    const total = this._pages.length;
    return this._pages.map((embed, i) => {
      embed.setFooter({ text: `${this._footerBase} · Página ${i + 1} de ${total}` });
      return embed;
    });
  }
}

// ── buildLogSummaryEmbed ─────────────────────────────────────────────────────

/**
 * Embed compacto para el canal principal. Solo resumen — el hilo tiene el resto.
 */
export function buildLogSummaryEmbed(log, category, mobs, items, siteUrl = '') {
  const color    = RELEVANCE_COLOR[log.relevance] ?? 0x4dd4e8;
  const catEmoji = category?.emoji ?? '📋';
  const catLabel = category?.label ?? log.category;
  const { normalItems, libres } = splitItems(items);

  const descPreview = truncate(log.description || 'Sin descripción.', 300);

  // URL directa al log en la web
  const logUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/index.html?log=${log.id}` : '';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(truncate(`${catEmoji} ${log.title}`, SAFE_TITLE))
    .setDescription(descPreview)
    .addFields(
      { name: '📂 Categoría',  value: `${catEmoji} ${catLabel}`,                              inline: true },
      { name: '⚡ Relevancia', value: RELEVANCE_LABEL[log.relevance] ?? log.relevance,         inline: true },
      { name: '📅 Fecha',      value: `<t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:f>`, inline: true },
    )
    .setTimestamp(new Date(log.created_at))
    .setFooter({ text: 'Culones RPG · Sistema de Logs' });

  // Conteo de contenido
  const counts = [];
  if (mobs.length > 0)         counts.push(`👾 ${mobs.length} mob${mobs.length > 1 ? 's' : ''}`);
  if (normalItems.length > 0)  counts.push(`🗡️ ${normalItems.length} item${normalItems.length > 1 ? 's' : ''}`);
  if (libres.length > 0)       counts.push(`📋 ${libres.length} bloque${libres.length > 1 ? 's' : ''} libre${libres.length > 1 ? 's' : ''}`);

  if (counts.length > 0) {
    embed.addFields({ name: '📊 Contenido', value: counts.join('  ·  '), inline: false });
  }

  embed.addFields({
    name:  '📖 Contenido completo',
    value: '↓ Ver el hilo de este mensaje para el log completo con todos los detalles.',
    inline: false,
  });

  if (logUrl) embed.setURL(logUrl);

  return embed;
}

// ── buildLogPageEmbeds ───────────────────────────────────────────────────────

/**
 * Genera el array completo de EmbedBuilders para el hilo.
 * Cada embed = un mensaje. Sin límite fijo de páginas.
 */
export function buildLogPageEmbeds(log, category, mobs, items, siteUrl = '') {
  const color    = RELEVANCE_COLOR[log.relevance] ?? 0x4dd4e8;
  const catEmoji = category?.emoji ?? '📋';
  const catLabel = category?.label ?? log.category;
  const { normalItems, libres } = splitItems(items);
  const footerBase = `Culones RPG · ${truncate(log.title, 60)}`;

  // URL base del log (sin item)
  const logBaseUrl = siteUrl ? `${siteUrl.replace(/\/$/, '')}/index.html?log=${log.id}` : '';

  /** Devuelve la URL directa a un item dentro del log, si hay siteUrl. */
  function itemUrl(itemId) {
    if (!logBaseUrl) return null;
    return `${logBaseUrl}&item=${itemId}`;
  }

  const builder = new PageBuilder(color, footerBase);

  // ── Página 1: Información general ────────────────────────────────────────
  builder.newSection(`${catEmoji} ${log.title}`);
  builder.addField('📂 Categoría',  `${catEmoji} ${catLabel}`);
  builder.addField('⚡ Relevancia', RELEVANCE_LABEL[log.relevance] ?? log.relevance);
  builder.addField('📅 Fecha',      `<t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:f>`);

  const counts = [];
  if (mobs.length)        counts.push(`${mobs.length} mob${mobs.length > 1 ? 's' : ''}`);
  if (normalItems.length) counts.push(`${normalItems.length} item${normalItems.length > 1 ? 's' : ''}`);
  if (libres.length)      counts.push(`${libres.length} bloque${libres.length > 1 ? 's' : ''} libre${libres.length > 1 ? 's' : ''}`);
  if (counts.length) builder.addField('📊 Contenido', counts.join(' · '));

  if (logBaseUrl) {
    builder.addField('🔗 Ver en la web', `[Abrir log completo](${logBaseUrl})`);
  }

  // ── Descripción completa ──────────────────────────────────────────────────
  if (log.description && log.description.trim()) {
    builder.addDescription(log.description, '📝 Descripción');
  }

  // ── Mobs ──────────────────────────────────────────────────────────────────
  if (mobs.length > 0) {
    builder.newSection(`👾 Mobs (${mobs.length})`);

    for (const mob of mobs) {
      const lines = [];

      // Stats en una línea
      const stats = [];
      if (mob.health != null) stats.push(`❤️ ${mob.health} HP`);
      if (mob.damage != null) stats.push(`⚔️ ${mob.damage} DMG`);
      if (mob.armor  != null) stats.push(`🛡️ ${mob.armor} ARM`);
      if (stats.length) lines.push(stats.join(' · '));

      if (mob.location)    lines.push(`📍 **Ubicación:** ${mob.location}`);
      if (mob.equipment)   lines.push(`🎒 **Equipamiento:** ${mob.equipment}`);
      if (mob.description) lines.push(`\n*${mob.description}*`);

      // extra_fields jsonb
      const extra = Array.isArray(mob.extra_fields) ? mob.extra_fields : [];
      for (const ef of extra) {
        if (ef?.key && ef?.value != null) lines.push(`**${ef.key}:** ${ef.value}`);
      }

      // Deep link al mob concreto
      const url = itemUrl(mob.id);
      if (url) lines.push(`[🔗 Ver en la web](${url})`);

      builder.addField(
        `👾 ${mob.name}`,
        lines.join('\n') || '_Sin datos adicionales._',
        `👾 Mobs (${mobs.length})`
      );
    }
  }

  // ── Items normales ────────────────────────────────────────────────────────
  if (normalItems.length > 0) {
    builder.newSection(`🗡️ Items (${normalItems.length})`);

    for (const item of normalItems) {
      const lines = [];

      const meta = [];
      if (item.item_type) meta.push(item.item_type);
      if (item.tier)      meta.push(`Tier ${item.tier}`);
      if (meta.length)    lines.push(meta.join(' · '));

      if (item.damage != null)  lines.push(`⚔️ ${item.damage} DMG`);

      // Encantamientos
      const enchants = Array.isArray(item.enchantments) ? item.enchantments : [];
      if (enchants.length) {
        const enchStr = enchants.map(e => {
          if (typeof e === 'string') return e;
          const n = e?.name ?? e?.id ?? '';
          const l = e?.level ?? e?.lvl ?? '';
          return l ? `${n} ${l}` : n;
        }).filter(Boolean).join(', ');
        if (enchStr) lines.push(`✨ **Encantamientos:** ${enchStr}`);
      }

      if (item.obtained_from && !item.obtained_from.startsWith('[') && !item.obtained_from.startsWith('{')) {
        lines.push(`📍 **Origen:** ${item.obtained_from}`);
      }
      if (item.description)  lines.push(`\n*${item.description}*`);

      const extra = Array.isArray(item.extra_fields) ? item.extra_fields : [];
      for (const ef of extra) {
        if (ef?.key && ef?.value != null) lines.push(`**${ef.key}:** ${ef.value}`);
      }

      // Deep link al item concreto
      const url = itemUrl(item.id);
      if (url) lines.push(`[🔗 Ver en la web](${url})`);

      builder.addField(
        `🗡️ ${item.name}`,
        lines.join('\n') || '_Sin datos adicionales._',
        `🗡️ Items (${normalItems.length})`
      );
    }
  }

  // ── Bloques libres ────────────────────────────────────────────────────────
  if (libres.length > 0) {
    builder.newSection(`📋 Bloques libres (${libres.length})`);

    for (const libre of libres) {
      const fields = parseLibreFields(libre);

      // Construir el texto completo del bloque
      const lines = [];
      for (const f of fields) {
        if (!f?.key && !f?.value) continue;
        if (f.key && f.value) lines.push(`**${f.key}:** ${f.value}`);
        else if (f.key)       lines.push(`**${f.key}**`);
        else if (f.value)     lines.push(f.value);

        for (const sub of f.subfields ?? []) {
          if (!sub?.key && !sub?.value) continue;
          if (sub.key && sub.value) lines.push(`> ↳ **${sub.key}:** ${sub.value}`);
          else                      lines.push(`> ↳ ${sub.key || sub.value}`);
        }
      }

      if (libre.description)  lines.push(`\n*${libre.description}*`);

      // Deep link al bloque libre concreto
      const url = itemUrl(libre.id);
      if (url) lines.push(`[🔗 Ver en la web](${url})`);

      const fullText = lines.join('\n') || '_Sin campos._';

      // splitFieldValue se encarga de dividir en continuaciones si supera 1024
      builder.addField(
        `📋 ${libre.name || 'Bloque libre'}`,
        fullText,
        `📋 Bloques libres (${libres.length})`
      );
    }
  }

  const pages = builder.build();

  // Validar todos los embeds antes de retornarlos
  pages.forEach((embed, i) => {
    try {
      validateEmbed(embed, `página ${i + 1}`);
    } catch (err) {
      console.error(`[logEmbeds] ⚠️  ${err.message}`);
    }
  });

  return pages;
}
