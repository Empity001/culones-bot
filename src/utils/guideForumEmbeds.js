import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { prepareDiscordImage } from './mediaAttachments.js';
import { renderWorkbenchMethod, recipeMethodText } from './renderWorkbench.js';
import { config } from '../config.js';

const MAX_DESC = 3800;
function clean(v) { return String(v ?? '').trim(); }
function truncate(v, max = 256) { const s = clean(v); return s.length <= max ? s : `${s.slice(0, max - 1)}…`; }
function array(v) { return Array.isArray(v) ? v : []; }
function splitText(value, max = MAX_DESC) {
  let rest = clean(value);
  if (!rest) return [];
  const chunks = [];
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * .55) cut = rest.lastIndexOf(' ', max);
    if (cut < max * .55) cut = max;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
function guideUrl(weaponId, rankId = null) {
  let url = `${config.siteUrl}/guides.html?weapon=${encodeURIComponent(weaponId)}`;
  if (rankId) url += `&rank=${encodeURIComponent(rankId)}`;
  return url;
}
function guideLinkUrl(link) {
  const weaponId = link?.weapon_id || link?.weaponId || link?.weapon;
  const rankId = link?.rank_id || link?.rankId || link?.rank;
  return weaponId ? guideUrl(weaponId, rankId) : null;
}
function recipeMethods(recipe) {
  if (!recipe) return [];
  if (Array.isArray(recipe.methods) && recipe.methods.length) return recipe.methods;
  return [recipe];
}
function infoVisuals(sections) {
  const section = array(sections).find(item => item?._kind === 'info_visuals');
  return array(section?.images || section?.visuals);
}
function visibleSections(sections) { return array(sections).filter(item => item?._kind !== 'info_visuals'); }

function simpleEmbed(color, title, description, url, footer) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(truncate(title))
    .setDescription(description || '_Sin información._')
    .setFooter({ text: footer });
  if (url) embed.setURL(url);
  return embed;
}

function textSpecs({ keyBase, color, title, description, url, footer }) {
  const chunks = splitText(description);
  return (chunks.length ? chunks : ['_Sin información._']).map((chunk, index) => ({
    key: index ? `${keyBase}:${index + 1}` : keyBase,
    embeds: [simpleEmbed(color, index ? `${title} — continuación ${index + 1}` : title, chunk, url, footer)],
    files: [],
  }));
}

async function imageSpec({ key, color, title, description, imageUrl, imageName, url, footer }) {
  const prepared = imageUrl ? await prepareDiscordImage(imageUrl, imageName) : null;
  const embed = simpleEmbed(color, title, description, url, footer);
  const files = [];
  if (prepared?.attachment) {
    embed.setImage(prepared.imageRef);
    files.push(prepared.attachment);
  }
  return {
    key,
    embeds: [embed],
    files,
    attachmentHash: prepared?.hash || null,
    warning: prepared?.error?.message || null,
  };
}

function rankSeparatorSpec(rank) {
  const name = clean(rank?.name || 'Rango').replace(/[\r\n]+/g, ' ').slice(0, 80);
  return {
    key: `rank:${rank.id}:separator`,
    content: `────────── **${name}** ──────────`,
    embeds: [],
    files: [],
  };
}

export async function buildGuideForumSpecs({ weapon, category, type, ranks }) {
  const color = Number.parseInt(String(category?.color || '#7c5cff').replace('#', ''), 16) || 0x7c5cff;
  const footer = `Culones RPG · ${weapon.name}`;
  const specs = [];
  const summaryLines = [
    `**Categoría:** ${category?.label || '—'}`,
    `**Tipo:** ${type?.label || '—'}`,
    `**Rangos:** ${ranks.length}`,
    '',
    `[Abrir esta Guía en la página](${guideUrl(weapon.id)})`,
  ];
  specs.push(await imageSpec({
    key: 'guide:summary',
    color,
    title: weapon.name,
    description: summaryLines.join('\n'),
    imageUrl: weapon.image_url,
    imageName: `guide-${weapon.id}-cover`,
    url: guideUrl(weapon.id),
    footer,
  }));

  for (const rank of ranks) {
    const rankUrl = guideUrl(weapon.id, rank.id);

    // Separador normal (no embed) para que el comienzo de cada rango sea
    // reconocible incluso en publicaciones muy extensas.
    specs.push(rankSeparatorSpec(rank));

    // La imagen del rango y su descripción pertenecen al mismo bloque.
    const descriptionChunks = splitText(rank.description);
    const firstDescription = descriptionChunks.shift() || '_Este rango no tiene descripción._';
    specs.push(await imageSpec({
      key: `rank:${rank.id}:overview`,
      color,
      title: `Rango · ${rank.name}`,
      description: `${firstDescription}\n\n[Ver rango en la página](${rankUrl})`,
      imageUrl: rank.image_url,
      imageName: `guide-${weapon.id}-rank-${rank.id}`,
      url: rankUrl,
      footer,
    }));

    descriptionChunks.forEach((chunk, index) => specs.push({
      key: `rank:${rank.id}:description:${index + 2}`,
      embeds: [simpleEmbed(
        color,
        `Descripción — continuación ${index + 2}`,
        `${chunk}\n\n[Ver rango en la página](${rankUrl})`,
        rankUrl,
        footer,
      )],
      files: [],
    }));

    const stats = array(rank.stats).filter(s => s?.key || s?.label || s?.value != null);
    if (stats.length) {
      const lines = stats.map(s => `**${s.key || s.label || 'Dato'}:** ${s.value ?? '—'}`);
      specs.push(...textSpecs({
        keyBase: `rank:${rank.id}:stats`, color, title: 'Estadísticas',
        description: `${lines.join('\n')}\n\n[Ver rango en la página](${rankUrl})`, url: rankUrl, footer,
      }));
    }

    for (const [index, ability] of array(rank.abilities).entries()) {
      const lines = [];
      if (ability.tag) lines.push(`**Tipo:** ${ability.tag}`);
      if (ability.level != null) lines.push(`**Nivel:** ${ability.level}${ability.level_max ? ` / ${ability.level_max}` : ''}`);
      if (ability.description) lines.push('', ability.description);
      for (const stat of array(ability.stats)) lines.push(`**${stat.key || stat.label || 'Dato'}:** ${stat.value ?? '—'}`);
      lines.push('', `[Ver rango en la página](${rankUrl})`);
      specs.push(...textSpecs({
        keyBase: `rank:${rank.id}:ability:${ability.id || index}`,
        color,
        title: `Habilidad · ${ability.name || `Habilidad ${index + 1}`}`,
        description: lines.join('\n'),
        url: rankUrl,
        footer,
      }));
    }

    for (const [index, visual] of infoVisuals(rank.extra_sections).entries()) {
      const linked = guideLinkUrl(visual.guide_link);
      const lines = [linked ? `[Abrir Guía relacionada](${linked})` : '', `[Ver rango en la página](${rankUrl})`].filter(Boolean).join('\n');
      specs.push(await imageSpec({
        key: `rank:${rank.id}:resource:${index}`,
        color,
        title: `Recurso visual · ${visual.name || `Recurso ${index + 1}`}`,
        description: lines,
        imageUrl: visual.image_url,
        imageName: `guide-${weapon.id}-resource-${rank.id}-${index}`,
        url: rankUrl,
        footer,
      }));
    }

    for (const [index, method] of recipeMethods(rank.upgrade_recipe).entries()) {
      const methodTitle = method.title || 'Mesa de trabajo';
      const buffer = await renderWorkbenchMethod(method, methodTitle);
      const filename = `workbench-${weapon.id}-${rank.id}-${index}.png`;
      const embed = simpleEmbed(
        color,
        `Mesas de trabajo · ${methodTitle}`,
        `${recipeMethodText(method, { guideLinkBuilder: guideLinkUrl })}\n\n[Ver rango en la página](${rankUrl})`,
        rankUrl,
        footer,
      ).setImage(`attachment://${filename}`);
      specs.push({
        key: `rank:${rank.id}:workbench:${index}`,
        embeds: [embed],
        files: [new AttachmentBuilder(buffer, { name: filename })],
      });
    }

    for (const [index, section] of visibleSections(rank.extra_sections).entries()) {
      const lines = [];
      if (section.text) lines.push(section.text);
      for (const field of array(section.fields)) {
        const key = clean(field?.key);
        const value = clean(field?.value);
        if (key || value) lines.push(`${key ? `**${key}:** ` : ''}${value || '—'}`);
      }
      lines.push('', `[Ver rango en la página](${rankUrl})`);
      const chunks = splitText(lines.join('\n'));
      (chunks.length ? chunks : ['_Sin contenido._']).forEach((chunk, part) => specs.push({
        key: `rank:${rank.id}:extra:${section.id || index}:${part + 1}`,
        embeds: [simpleEmbed(color, part ? `${section.title || 'Extra'} — continuación ${part + 1}` : `Extra · ${section.title || `Extra ${index + 1}`}`, chunk, rankUrl, footer)],
        files: [],
      }));
    }
  }

  specs.push({
    key: 'guide:footer',
    embeds: [new EmbedBuilder().setColor(color).setDescription(`📖 [Consulta la Guía completa y sus enlaces interactivos en la página.](${guideUrl(weapon.id)})`).setFooter({ text: footer })],
    files: [],
  });
  return specs;
}
