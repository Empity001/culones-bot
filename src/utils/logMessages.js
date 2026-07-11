import { EmbedBuilder } from 'discord.js';
import { splitItems, parseLibreFields, formatEquipmentForCanvas, formatSourceForCanvas } from './libreFields.js';
import { prepareDiscordImage } from './mediaAttachments.js';
import { config } from '../config.js';

const RELEVANCE_COLOR = { low: 0x9a92b8, normal: 0x7c5cff, high: 0xf5c542, critical: 0xe84d4d };
const RELEVANCE_LABEL = { low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Crítica' };
const MAX_DESCRIPTION = 3900;

function clean(value) { return String(value ?? '').trim(); }
function truncate(value, max = 256) {
  const text = clean(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
function splitLongText(text, max = MAX_DESCRIPTION) {
  const raw = clean(text);
  if (!raw) return ['_Sin información adicional._'];
  const chunks = [];
  let rest = raw;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.55) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.55) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function baseUrl(logId, tab = null, entry = null) {
  let url = `${config.siteUrl}/index.html?log=${encodeURIComponent(logId)}`;
  if (tab) url += `&tab=${encodeURIComponent(tab)}`;
  if (entry) url += `&entry=${encodeURIComponent(entry)}`;
  return url;
}

function linesFromExtras(extraFields) {
  const source = Array.isArray(extraFields) ? extraFields : [];
  return source.flatMap(field => {
    const key = clean(field?.key || field?.label || field?.name);
    const value = clean(field?.value ?? field?.text ?? field?.content);
    if (!key && !value) return [];
    return [key ? `**${key}:** ${value || '—'}` : value];
  });
}

async function makeSpecs({ keyBase, title, color, descriptionLines, imageUrl, imageName, url, footer }) {
  const chunks = splitLongText(descriptionLines.filter(Boolean).join('\n'));
  const image = imageUrl ? await prepareDiscordImage(imageUrl, imageName) : null;
  return chunks.map((chunk, index) => {
    const continued = index > 0;
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(truncate(continued ? `${title} — continuación ${index + 1}` : title))
      .setDescription(chunk)
      .setFooter({ text: footer });
    if (url) embed.setURL(url);
    const files = [];
    if (!continued && image?.attachment) {
      embed.setImage(image.imageRef);
      files.push(image.attachment);
    }
    return {
      key: continued ? `${keyBase}:${index + 1}` : keyBase,
      embeds: [embed],
      files,
      imageHash: !continued ? image?.hash || null : null,
      warning: image?.error ? `No se pudo cargar la imagen: ${image.error.message}` : null,
    };
  });
}

export async function buildLogMessageSpecs(log, category, mobs = [], items = []) {
  const color = RELEVANCE_COLOR[log.relevance] ?? 0x7c5cff;
  const catEmoji = category?.emoji || '📋';
  const catLabel = category?.label || log.category || 'Sin categoría';
  const { normalItems, libres } = splitItems(items);
  const summaryUrl = baseUrl(log.id);
  const cover = log.cover_image_url ? await prepareDiscordImage(log.cover_image_url, `log-${log.id}-cover`) : null;

  const summary = new EmbedBuilder()
    .setColor(color)
    .setTitle(truncate(`${catEmoji} ${log.title}`))
    .setURL(summaryUrl)
    .setDescription(truncate(log.description || 'Sin descripción.', 900))
    .addFields(
      { name: 'Categoría', value: `${catEmoji} ${catLabel}`, inline: true },
      { name: 'Relevancia', value: RELEVANCE_LABEL[log.relevance] || clean(log.relevance) || 'Normal', inline: true },
      { name: 'Fecha', value: `<t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:f>`, inline: true },
      { name: 'Contenido', value: `👾 ${mobs.length} mobs · 🗡️ ${normalItems.length} items · ✦ ${libres.length} Extras`, inline: false },
      { name: 'Likes', value: `❤ ${Number(log.likes || 0)}`, inline: true },
      { name: 'Detalles', value: 'Abre el hilo para consultar cada mob, item y Extra por separado.', inline: false },
    )
    .setFooter({ text: 'Culones RPG · Logs' })
    .setTimestamp(new Date(log.updated_at || log.created_at));

  const summaryFiles = [];
  if (cover?.attachment) {
    summary.setImage(cover.imageRef);
    summaryFiles.push(cover.attachment);
  }

  const entries = [];

  for (const mob of mobs) {
    const stats = [];
    if (mob.health != null) stats.push(`**Vida:** ${mob.health}`);
    if (mob.damage != null) stats.push(`**Daño:** ${mob.damage}`);
    if (mob.armor != null) stats.push(`**Armadura:** ${mob.armor}`);
    const equipment = formatEquipmentForCanvas(mob.equipment);
    const lines = [
      stats.join(' · '),
      mob.location ? `**Ubicación:** ${mob.location}` : '',
      equipment ? `**Equipamiento:** ${equipment}` : '',
      mob.description ? `\n${mob.description}` : '',
      ...linesFromExtras(mob.extra_fields),
      `\n[Ver este mob en la página](${baseUrl(log.id, 'mobs', mob.id)})`,
    ];
    entries.push(...await makeSpecs({
      keyBase: `mob:${mob.id}`,
      title: `👾 ${mob.name || 'Mob'}`,
      color,
      descriptionLines: lines,
      imageUrl: mob.image_url,
      imageName: `mob-${mob.id}`,
      url: baseUrl(log.id, 'mobs', mob.id),
      footer: `Culones RPG · ${log.title} · Mobs`,
    }));
  }

  for (const item of normalItems) {
    const meta = [];
    if (item.item_type) meta.push(`**Tipo:** ${item.item_type}`);
    if (item.tier) meta.push(`**Rango:** ${item.tier}`);
    if (item.damage != null) meta.push(`**Daño:** ${item.damage}`);
    const enchants = Array.isArray(item.enchantments)
      ? item.enchantments.map(e => typeof e === 'string' ? e : [e?.name || e?.id, e?.level || e?.lvl].filter(Boolean).join(' ')).filter(Boolean).join(', ')
      : '';
    const source = formatSourceForCanvas(item.obtained_from);
    const lines = [
      meta.join(' · '),
      enchants ? `**Encantamientos:** ${enchants}` : '',
      source ? `**Obtención:** ${source}` : '',
      item.description ? `\n${item.description}` : '',
      ...linesFromExtras(item.extra_fields),
      `\n[Ver este item en la página](${baseUrl(log.id, 'items', item.id)})`,
    ];
    entries.push(...await makeSpecs({
      keyBase: `item:${item.id}`,
      title: `🗡️ ${item.name || 'Item'}`,
      color,
      descriptionLines: lines,
      imageUrl: item.image_url,
      imageName: `item-${item.id}`,
      url: baseUrl(log.id, 'items', item.id),
      footer: `Culones RPG · ${log.title} · Items`,
    }));
  }

  for (const extra of libres) {
    const parsed = parseLibreFields(extra);
    const lines = [];
    for (const field of parsed) {
      const key = clean(field?.key);
      const value = clean(field?.value);
      if (key || value) lines.push(key ? `**${key}:** ${value || '—'}` : value);
      for (const sub of field?.subfields || []) {
        const sk = clean(sub?.key);
        const sv = clean(sub?.value);
        if (sk || sv) lines.push(`> ${sk ? `**${sk}:** ` : ''}${sv || '—'}`);
      }
    }
    if (extra.description) lines.push(`\n${extra.description}`);
    lines.push(`\n[Ver este Extra en la página](${baseUrl(log.id, 'blocks', extra.id)})`);
    entries.push(...await makeSpecs({
      keyBase: `extra:${extra.id}`,
      title: `✦ ${extra.name || 'Extra'}`,
      color,
      descriptionLines: lines,
      imageUrl: extra.image_url,
      imageName: `extra-${extra.id}`,
      url: baseUrl(log.id, 'blocks', extra.id),
      footer: `Culones RPG · ${log.title} · Extras`,
    }));
  }

  const footerEmbed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`📖 [Consulta la versión completa, más detallada y con imágenes en la página.](${summaryUrl})`)
    .setFooter({ text: 'Culones RPG · Fin del Log' });
  entries.push({ key: 'footer', embeds: [footerEmbed], files: [] });

  return {
    summary: { key: 'summary', embeds: [summary], files: summaryFiles, imageHash: cover?.hash || null },
    entries,
  };
}
