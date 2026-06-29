// src/utils/renderTierlist.js
// Genera una imagen PNG de la tierlist para una columna específica.
// Usa @napi-rs/canvas (nativo, sin dependencias de sistema como node-canvas).

import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import axios from 'axios';

// ── Diseño ────────────────────────────────────────────────────────────────────
const ITEM_SIZE   = 52;   // px de cada sprite cuadrado
const ITEM_GAP    = 6;    // gap entre items
const ROW_LABEL_W = 72;   // ancho de la etiqueta de fila (S, A, B...)
const PADDING     = 16;   // padding general
const ROW_GAP     = 8;    // gap entre filas
const MIN_ITEMS_W = 200;  // ancho mínimo de la zona de items
const FONT_LABEL  = 'bold 22px sans-serif';
const FONT_NAME   = '10px sans-serif';
const BG_COLOR    = '#0c0a14';
const BORDER_COLOR = 'rgba(255,255,255,0.08)';

// Cache de imágenes descargadas
const imageCache = new Map();

async function fetchImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
    const img = await loadImage(Buffer.from(response.data));
    imageCache.set(url, img);
    return img;
  } catch {
    return null;
  }
}

/**
 * Calcula cuántos items caben por fila dada la anchura del canvas.
 * Usamos un mínimo de 4 y máximo de 10 por fila de display.
 */
function itemsPerRow(totalWidth) {
  const availableW = totalWidth - ROW_LABEL_W - PADDING * 2;
  return Math.max(4, Math.floor(availableW / (ITEM_SIZE + ITEM_GAP)));
}

/**
 * Genera el PNG de la tierlist para una columna.
 * @param {Array<{row, items}>} grouped  — salida de groupByRow()
 * @param {string} columnLabel           — 'Arma', 'Sub-arma', 'Accesorio'
 * @param {string} serverName            — nombre del servidor (footer)
 * @returns {Buffer} PNG buffer
 */
export async function renderTierlistImage(grouped, columnLabel, serverName = 'Culones RPG') {
  // ── 1. Pre-descargar todas las imágenes en paralelo ──────────────────────
  const allItems = grouped.flatMap(g => g.items);
  await Promise.all(
    allItems.filter(i => i.image_url).map(i => fetchImage(i.image_url))
  );

  // ── 2. Calcular dimensiones ───────────────────────────────────────────────
  // Primero hacemos un pase para saber la anchura total necesaria
  const maxItemsInAnyRow = Math.max(...grouped.map(g => g.items.length), 1);
  // Anchura: suficiente para 8 items o los que haya (mínimo 400, máximo 900)
  const displayCols = Math.min(Math.max(maxItemsInAnyRow, 4), 8);
  const canvasW = Math.min(
    Math.max(
      ROW_LABEL_W + PADDING * 2 + displayCols * (ITEM_SIZE + ITEM_GAP),
      400
    ),
    900
  );

  const IPR = itemsPerRow(canvasW);

  // Calcular altura de cada fila (puede necesitar múltiples líneas de items)
  const rowHeights = grouped.map(g => {
    const lines = Math.max(1, Math.ceil(g.items.length / IPR));
    return lines * (ITEM_SIZE + ITEM_GAP) + ITEM_GAP + 8; // 8 = label name space
  });

  const HEADER_H = 50; // título de la columna
  const FOOTER_H = 28;
  const totalH = HEADER_H + PADDING
    + rowHeights.reduce((s, h) => s + h + ROW_GAP, 0)
    + PADDING + FOOTER_H;

  // ── 3. Crear canvas ───────────────────────────────────────────────────────
  const canvas = createCanvas(canvasW, totalH);
  const ctx    = canvas.getContext('2d');

  // Fondo
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, totalH);

  // ── 4. Header ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 0, canvasW, HEADER_H);
  ctx.strokeStyle = 'rgba(77,212,232,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, HEADER_H); ctx.lineTo(canvasW, HEADER_H); ctx.stroke();

  ctx.fillStyle = '#4dd4e8';
  ctx.font = 'bold 18px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`📊 TIERLIST · ${columnLabel.toUpperCase()}`, PADDING, HEADER_H / 2);

  // ── 5. Filas ──────────────────────────────────────────────────────────────
  let y = HEADER_H + PADDING;

  for (let ri = 0; ri < grouped.length; ri++) {
    const { row, items } = grouped[ri];
    const rowH = rowHeights[ri];

    // Fondo de la etiqueta de fila
    const rowColor = row.color || '#4dd4e8';
    ctx.fillStyle = rowColor;
    ctx.fillRect(PADDING, y, ROW_LABEL_W, rowH);

    // Nombre de fila centrado
    ctx.fillStyle = contrastColor(rowColor);
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      truncate(row.name, 6),
      PADDING + ROW_LABEL_W / 2,
      y + rowH / 2
    );

    // Zona de items
    const itemsX = PADDING + ROW_LABEL_W + ITEM_GAP;
    const itemsW = canvasW - itemsX - PADDING;
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    ctx.fillRect(itemsX, y, itemsW, rowH);

    // Dibujar items
    for (let ii = 0; ii < items.length; ii++) {
      const item = items[ii];
      const col  = ii % IPR;
      const line = Math.floor(ii / IPR);
      const ix   = itemsX + ITEM_GAP + col * (ITEM_SIZE + ITEM_GAP);
      const iy   = y + ITEM_GAP + line * (ITEM_SIZE + ITEM_GAP + 16);

      // Fondo del item
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(ctx, ix, iy, ITEM_SIZE, ITEM_SIZE, 4);
      ctx.fill();

      // Imagen del item (pixelated)
      if (item.image_url) {
        const img = imageCache.get(item.image_url);
        if (img) {
          ctx.imageSmoothingEnabled = false; // pixel-art crisp
          ctx.drawImage(img, ix, iy, ITEM_SIZE, ITEM_SIZE);
        }
      } else {
        // Placeholder con inicial
        ctx.fillStyle = 'rgba(77,212,232,0.15)';
        roundRect(ctx, ix, iy, ITEM_SIZE, ITEM_SIZE, 4);
        ctx.fill();
        ctx.fillStyle = '#4dd4e8';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((item.name || '?')[0].toUpperCase(), ix + ITEM_SIZE / 2, iy + ITEM_SIZE / 2);
      }

      // Nombre del item debajo
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(truncate(item.name || '', 10), ix + ITEM_SIZE / 2, iy + ITEM_SIZE + 2);
    }

    // Texto "vacío" si no hay items
    if (items.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('— sin elementos —', itemsX + ITEM_GAP * 2, y + rowH / 2);
    }

    // Borde separador entre filas
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING, y + rowH);
    ctx.lineTo(canvasW - PADDING, y + rowH);
    ctx.stroke();

    y += rowH + ROW_GAP;
  }

  // ── 6. Footer ─────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, totalH - FOOTER_H, canvasW, FOOTER_H);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${serverName} · ${new Date().toLocaleDateString('es-ES')}`, PADDING, totalH - FOOTER_H / 2);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#4dd4e8';
  ctx.fillText('culones-rpg', canvasW - PADDING, totalH - FOOTER_H / 2);

  return canvas.toBuffer('image/png');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/** Devuelve blanco o negro según el color de fondo para máximo contraste */
function contrastColor(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // Luminance relativa
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '#0c0a14' : '#ffffff';
}

/** Dibuja un rectángulo con esquinas redondeadas */
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
