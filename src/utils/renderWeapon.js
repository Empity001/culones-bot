// src/utils/renderWeapon.js
// Genera una imagen PNG por cada RANGO de un arma
// (stats, habilidades, receta de mejora).

import { createCanvas, loadImage } from '@napi-rs/canvas';
import axios from 'axios';
import { ensureFonts, FONT } from './fonts.js';

// ── Tokens de diseño ─────────────────────────────────────────────────────────
const BG_COLOR     = '#0c0a14';
const BORDER_COLOR = 'rgba(255,255,255,0.08)';
const GOLD         = '#f3b73a';
const CYAN         = '#4dd4e8';
const MAGENTA      = '#ff3d8e';
const GREEN        = '#38e07a';
const INK_100      = '#f4f1fb';
const INK_400      = '#9a92b8';
const INK_600      = 'rgba(255,255,255,0.35)';

const CANVAS_W       = 640;
const PADDING        = 20;
const HEADER_IMG_SIZE = 72;

const imageCache = new Map();
const IMAGE_FAIL_CACHE = new Set();

async function fetchImage(url) {
  if (!url) return null;
  if (IMAGE_FAIL_CACHE.has(url)) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://discord.com/',
        'sec-fetch-dest': 'image',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'cross-site',
      },
    });
    const img = await loadImage(Buffer.from(response.data));
    imageCache.set(url, img);
    return img;
  } catch {
    IMAGE_FAIL_CACHE.add(url);
    return null;
  }
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function estimateHeight(rank) {
  const measureCanvas = createCanvas(10, 10);
  const ctx = measureCanvas.getContext('2d');
  // Registrar fuentes para medir correctamente
  ensureFonts();

  let h = PADDING;
  h += HEADER_IMG_SIZE + 16;

  ctx.font = `13px ${FONT.sans}`;
  const contentW = CANVAS_W - PADDING * 2;

  if (rank.description) {
    const lines = wrapText(ctx, rank.description, contentW - 4);
    h += 22 + lines.length * 18 + 10;
  }

  const stats = Array.isArray(rank.stats) ? rank.stats : [];
  if (stats.length > 0) h += 26 + stats.length * 30 + 4;

  const abilities = Array.isArray(rank.abilities) ? rank.abilities : [];
  if (abilities.length > 0) {
    h += 26;
    for (const ab of abilities) {
      h += 8 + 22;
      if (ab.description) h += wrapText(ctx, ab.description, contentW - 40).length * 16 + 4;
      h += 22;
      const abStats = Array.isArray(ab.stats) ? ab.stats : [];
      if (abStats.length > 0) h += Math.ceil(abStats.length / 2) * 18 + 4;
      h += 8 + 6;
    }
    h += 6;
  }

  if (rank.upgrade_recipe) {
    // Soporte para el nuevo formato multi-método: {methods:[...]} o método directo
    const recipeMethods = getRecipeMethods(rank.upgrade_recipe);
    // Cada método puede tener materiales/grid de distinto tamaño
    let recipeH = 26; // header
    for (const method of recipeMethods) {
      if (method.title) recipeH += 18;
      recipeH += 56 + 24; // slot row + gap
    }
    h += recipeH;
  }

  h += PADDING + 30;
  return Math.max(Math.round(h), 280);
}

// ── Helpers de receta ────────────────────────────────────────────────────────
// La web evolucionó de una receta plana {materials, result} a un sistema
// con múltiples métodos y modos: trade/crafting/furnace/smithing.
// getRecipeMethods normaliza ambos formatos para que el renderer siempre
// reciba un array de métodos, independientemente de cuán vieja sea la data.

function getRecipeMethods(recipe) {
  if (!recipe) return [];
  // Nuevo formato: { methods: [...] }
  if (Array.isArray(recipe.methods) && recipe.methods.length > 0) return recipe.methods;
  // Formato legacy / directo: el objeto raíz ES el único método
  return [recipe];
}

function getRecipeSlots(method) {
  const mode = method.mode || 'trade';
  if (mode === 'crafting') return Array.isArray(method.grid) ? method.grid : [];
  if (mode === 'furnace' || mode === 'smithing') return Array.isArray(method.inputs) ? method.inputs : [];
  // trade: materials
  return Array.isArray(method.materials) ? method.materials : [];
}

function getRecipeLabel(method) {
  const mode = method.mode || 'trade';
  if (mode === 'crafting') return 'Mesa de crafteo';
  if (mode === 'furnace') {
    const labels = { blast_furnace: 'Alto horno', smoker: 'Ahumador' };
    return labels[method.furnace_type] || 'Horno';
  }
  if (mode === 'smithing') return 'Mesa de herrería';
  return null; // trade: sin label de modo
}

export async function renderWeaponRankImage({ weapon, category, type, rank }) {
  ensureFonts();

  const safeImageUrl = rank.image_url || weapon.image_url;
  const headerImg    = await fetchImage(safeImageUrl);

  const recipe       = rank.upgrade_recipe;
  const recipeMethods = getRecipeMethods(recipe);

  // Pre-cargar todas las imágenes de todos los métodos de receta
  const methodImageData = await Promise.all(recipeMethods.map(async (method) => {
    const slots = getRecipeSlots(method);
    const slotImages = await Promise.all(slots.map(s => fetchImage(s?.image_url)));
    const resultImg = await fetchImage(method.result?.image_url);
    return { method, slots, slotImages, resultImg };
  }));

  const totalH = estimateHeight(rank);
  const canvas  = createCanvas(CANVAS_W, totalH);
  const ctx     = canvas.getContext('2d');

  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_W, totalH);

  let y          = PADDING;
  const contentW = CANVAS_W - PADDING * 2;

  // ── Header: imagen + nombre + badges ────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, PADDING, y, HEADER_IMG_SIZE, HEADER_IMG_SIZE, 8);
  ctx.fill();

  if (headerImg) {
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    roundRect(ctx, PADDING, y, HEADER_IMG_SIZE, HEADER_IMG_SIZE, 8);
    ctx.clip();
    ctx.drawImage(headerImg, PADDING, y, HEADER_IMG_SIZE, HEADER_IMG_SIZE);
    ctx.restore();
  } else {
    ctx.fillStyle    = INK_400;
    ctx.font         = `bold 28px ${FONT.sans}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((weapon.name || '?')[0].toUpperCase(), PADDING + HEADER_IMG_SIZE / 2, y + HEADER_IMG_SIZE / 2);
  }

  const headTextX  = PADDING + HEADER_IMG_SIZE + 16;

  ctx.fillStyle    = INK_100;
  ctx.font         = `bold 22px ${FONT.sans}`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(truncate(weapon.name, 26), headTextX, y);

  ctx.fillStyle = GOLD;
  ctx.font      = `bold 14px ${FONT.sans}`;
  ctx.fillText(rank.name, headTextX, y + 30);

  // Badges
  let badgeX     = headTextX;
  const badgeY   = y + 52;
  ctx.font       = `11px ${FONT.sans}`;

  if (category) {
    const label = ` ${category.label} `;
    const w     = ctx.measureText(label).width + 10;
    ctx.strokeStyle = category.color || CYAN;
    ctx.lineWidth   = 1;
    roundRect(ctx, badgeX, badgeY, w, 20, 10);
    ctx.stroke();
    ctx.fillStyle    = category.color || CYAN;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, badgeX + 5, badgeY + 10);
    badgeX += w + 8;
  }

  if (type) {
    const label = ` ${type.label} `;
    const w     = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, badgeX, badgeY, w, 20, 10);
    ctx.fill();
    ctx.fillStyle    = INK_100;
    ctx.textBaseline = 'middle';
    ctx.fillText(label, badgeX + 5, badgeY + 10);
  }

  if (!weapon.published) {
    ctx.fillStyle    = MAGENTA;
    ctx.font         = `bold 10px ${FONT.sans}`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('OCULTA', CANVAS_W - PADDING, y);
    ctx.textAlign = 'left';
  }

  y += HEADER_IMG_SIZE + 16;

  // Separador
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, y);
  ctx.lineTo(CANVAS_W - PADDING, y);
  ctx.stroke();
  y += 14;

  // ── Descripción ───────────────────────────────────────────────────────────
  if (rank.description) {
    ctx.fillStyle    = CYAN;
    ctx.font         = `bold 13px ${FONT.sans}`;
    ctx.textBaseline = 'top';
    ctx.fillText('DESCRIPCION', PADDING, y);
    y += 22;

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font      = `13px ${FONT.sans}`;
    const lines   = wrapText(ctx, rank.description, contentW - 4);
    for (const line of lines) {
      ctx.fillText(line, PADDING, y);
      y += 18;
    }
    y += 10;
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = Array.isArray(rank.stats) ? rank.stats : [];
  if (stats.length > 0) {
    ctx.fillStyle = GOLD;
    ctx.font      = `bold 13px ${FONT.sans}`;
    ctx.fillText('ESTADISTICAS', PADDING, y);
    y += 26;

    for (const s of stats) {
      const label = truncate(String(s.key ?? s.label ?? ''), 18);
      const value = String(s.value ?? '');

      ctx.fillStyle = INK_400;
      ctx.font      = `12px ${FONT.sans}`;
      ctx.fillText(label, PADDING, y + 2);

      const barX = PADDING + 130;
      const barW = contentW - 130 - 60;

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, barX, y, barW, 14, 4);
      ctx.fill();

      ctx.fillStyle = GOLD;
      roundRect(ctx, barX, y, barW, 14, 4);
      ctx.fill();

      ctx.fillStyle    = INK_100;
      ctx.font         = `bold 12px ${FONT.sans}`;
      ctx.textAlign    = 'right';
      ctx.fillText(truncate(value, 10), CANVAS_W - PADDING, y + 2);
      ctx.textAlign = 'left';

      y += 30;
    }
    y += 4;
  }

  // ── Habilidades ───────────────────────────────────────────────────────────
  const abilities = Array.isArray(rank.abilities) ? rank.abilities : [];
  if (abilities.length > 0) {
    ctx.fillStyle = MAGENTA;
    ctx.font      = `bold 13px ${FONT.sans}`;
    ctx.fillText('HABILIDADES', PADDING, y);
    y += 26;

    for (const ab of abilities) {
      const cardTop  = y;
      const descLines = ab.description
        ? wrapText(ctx, ab.description, contentW - 24)
        : [];

      let cardH = 8 + 22;
      if (descLines.length > 0) cardH += descLines.length * 16 + 4;
      cardH += 22;
      const abStats = Array.isArray(ab.stats) ? ab.stats : [];
      if (abStats.length > 0) cardH += Math.ceil(abStats.length / 2) * 18 + 4;
      cardH += 8;

      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      roundRect(ctx, PADDING, cardTop, contentW, cardH, 8);
      ctx.fill();

      let innerY       = cardTop + 8;
      ctx.fillStyle    = INK_100;
      ctx.font         = `bold 13px ${FONT.sans}`;
      ctx.textBaseline = 'top';
      ctx.textAlign    = 'left';
      ctx.fillText(truncate(ab.name || 'Habilidad', 30), PADDING + 12, innerY);

      if (ab.tag) {
        ctx.fillStyle = MAGENTA;
        ctx.font      = `10px ${FONT.sans}`;
        ctx.textAlign = 'right';
        ctx.fillText(ab.tag, PADDING + contentW - 12, innerY + 2);
        ctx.textAlign = 'left';
      }
      innerY += 22;

      if (descLines.length > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.font      = `11px ${FONT.sans}`;
        for (const line of descLines) {
          ctx.fillText(line, PADDING + 12, innerY);
          innerY += 16;
        }
        innerY += 4;
      }

      // Barra de nivel
      const level    = ab.level ?? 0;
      const levelMax = ab.level_max ?? 10;
      const pct      = levelMax > 0 ? Math.min(1, Math.max(0, level / levelMax)) : 0;

      ctx.fillStyle = INK_400;
      ctx.font      = `10px ${FONT.sans}`;
      ctx.fillText(`Nivel ${level}${levelMax ? ' / ' + levelMax : ''}`, PADDING + 12, innerY + 2);

      const lvlBarX = PADDING + 110;
      const lvlBarW = contentW - 110 - 24;

      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, lvlBarX, innerY, lvlBarW, 10, 4);
      ctx.fill();

      ctx.fillStyle = GREEN;
      roundRect(ctx, lvlBarX, innerY, Math.max(4, lvlBarW * pct), 10, 4);
      ctx.fill();
      innerY += 22;

      if (abStats.length > 0) {
        ctx.font      = `10.5px ${FONT.sans}`;
        const colW    = contentW / 2;
        abStats.forEach((s, idx) => {
          const col     = idx % 2;
          const row     = Math.floor(idx / 2);
          const sx      = PADDING + 12 + col * colW;
          const sy      = innerY + row * 18;
          const keyText = `${truncate(String(s.key ?? s.label ?? ''), 14)}: `;
          ctx.fillStyle = INK_400;
          ctx.fillText(keyText, sx, sy);
          const labelW  = ctx.measureText(keyText).width;
          ctx.fillStyle = INK_100;
          ctx.fillText(truncate(String(s.value ?? ''), 14), sx + labelW, sy);
        });
      }

      y = cardTop + cardH + 6;
    }
    y += 6;
  }

  // ── Mejora/fabricación ────────────────────────────────────────────────────
  if (recipe && recipeMethods.length > 0) {
    ctx.fillStyle    = CYAN;
    ctx.font         = `bold 13px ${FONT.sans}`;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('MEJORA/FABRICACIÓN', PADDING, y);
    y += 26;

    const slotSize = 52;

    for (const { method, slots, slotImages, resultImg } of methodImageData) {
      const modeLabel = getRecipeLabel(method);
      if (method.title || modeLabel) {
        ctx.fillStyle    = INK_400;
        ctx.font         = `10px ${FONT.sans}`;
        ctx.textBaseline = 'top';
        ctx.textAlign    = 'left';
        ctx.fillText(method.title || modeLabel || '', PADDING, y);
        y += 16;
      }

      const slotY = y;
      let mx = PADDING;

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i] || {};
        const img  = slotImages[i];

        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundRect(ctx, mx, slotY, slotSize, slotSize, 6);
        ctx.fill();

        if (img) {
          ctx.imageSmoothingEnabled = false;
          ctx.save();
          roundRect(ctx, mx, slotY, slotSize, slotSize, 6);
          ctx.clip();
          ctx.drawImage(img, mx, slotY, slotSize, slotSize);
          ctx.restore();
        }

        const qty = slot.qty ?? slot.count ?? 1;
        if (qty > 1) {
          ctx.fillStyle    = INK_100;
          ctx.font         = `bold 9px ${FONT.sans}`;
          ctx.textAlign    = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`x${qty}`, mx + slotSize - 3, slotY + slotSize - 3);
        }

        ctx.textAlign    = 'center';
        ctx.font         = `9px ${FONT.sans}`;
        ctx.fillStyle    = INK_400;
        ctx.textBaseline = 'top';
        ctx.fillText(truncate(slot.name || '', 10), mx + slotSize / 2, slotY + slotSize + 3);

        mx += slotSize + 8;
      }

      // Flecha
      ctx.fillStyle    = INK_400;
      ctx.font         = `bold 18px ${FONT.sans}`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('→', mx + 10, slotY + slotSize / 2);
      mx += 26;

      // Resultado
      const result = method.result || {};
      ctx.fillStyle = 'rgba(243,183,58,0.12)';
      roundRect(ctx, mx, slotY, slotSize, slotSize, 6);
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth   = 1;
      roundRect(ctx, mx, slotY, slotSize, slotSize, 6);
      ctx.stroke();

      if (resultImg) {
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        roundRect(ctx, mx, slotY, slotSize, slotSize, 6);
        ctx.clip();
        ctx.drawImage(resultImg, mx, slotY, slotSize, slotSize);
        ctx.restore();
      }

      ctx.fillStyle    = GOLD;
      ctx.textAlign    = 'center';
      ctx.font         = `9px ${FONT.sans}`;
      ctx.textBaseline = 'top';
      ctx.fillText(truncate(result.name || '', 10), mx + slotSize / 2, slotY + slotSize + 3);
      ctx.textAlign = 'left';

      y = slotY + slotSize + 20;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, totalH - 30);
  ctx.lineTo(CANVAS_W - PADDING, totalH - 30);
  ctx.stroke();

  ctx.fillStyle    = INK_600;
  ctx.font         = `10px ${FONT.sans}`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `Culones RPG · Guías · ${new Date().toLocaleDateString('es-ES')}`,
    PADDING,
    totalH - 15
  );

  ctx.fillStyle = CYAN;
  ctx.textAlign = 'right';
  ctx.fillText('culones-rpg', CANVAS_W - PADDING, totalH - 15);

  return canvas.toBuffer('image/png');
}
