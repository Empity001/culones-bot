import { createCanvas, loadImage } from '@napi-rs/canvas';
import { downloadImage } from './mediaAttachments.js';

const SLOT = 68;
const SLOT_GAP = 5;
const PANEL_MARGIN = 12;
const HEADER_HEIGHT = 58;

const COLORS = {
  panel: '#c6c6c6',
  panelLight: '#ffffff',
  panelMid: '#9b9b9b',
  panelDark: '#555555',
  slot: '#8b8b8b',
  slotDark: '#373737',
  slotLight: '#f3f3f3',
  text: '#2d2d2d',
  textMuted: '#4c4c4c',
  result: '#9a8ab2',
  resultBorder: '#694c90',
};

function modeLabel(method = {}) {
  if (method.mode === 'crafting') return 'Mesa de crafteo';
  if (method.mode === 'furnace') {
    if (method.furnace_type === 'blast_furnace') return 'Alto horno';
    if (method.furnace_type === 'smoker') return 'Ahumador';
    return 'Horno normal';
  }
  if (method.mode === 'smithing') return 'Mesa de herrería';
  return 'Intercambio';
}

function canvasSize(method = {}) {
  if (method.mode === 'crafting') return { width: 600, height: 350 };
  if (method.mode === 'furnace') return { width: 520, height: 390 };
  if (method.mode === 'smithing') return { width: 620, height: 265 };
  const count = Math.max(1, Math.min(6, (method.materials || []).length));
  return { width: 760, height: count > 3 ? 340 : 245 };
}

function drawText(ctx, value, x, y, size = 22, align = 'left', weight = 'normal', color = COLORS.text) {
  ctx.font = `${weight} ${size}px "Liberation Sans"`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(String(value || ''), x, y);
}

function drawPanel(ctx, width, height) {
  const x = PANEL_MARGIN;
  const y = PANEL_MARGIN;
  const w = width - PANEL_MARGIN * 2;
  const h = height - PANEL_MARGIN * 2;

  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(x, y, w, h);

  // Bisel grueso al estilo de las interfaces de Minecraft.
  ctx.fillStyle = COLORS.panelLight;
  ctx.fillRect(x, y, w, 5);
  ctx.fillRect(x, y, 5, h);
  ctx.fillStyle = COLORS.panelDark;
  ctx.fillRect(x, y + h - 5, w, 5);
  ctx.fillRect(x + w - 5, y, 5, h);

  ctx.fillStyle = COLORS.panelMid;
  ctx.fillRect(x + 5, y + h - 9, w - 10, 4);
  ctx.fillRect(x + w - 9, y + 5, 4, h - 10);
}

function drawHeader(ctx, title, method, width) {
  drawText(ctx, title || 'Mesa de trabajo', 34, 37, 25, 'left', 'bold');
  drawText(ctx, modeLabel(method), width - 34, 38, 17, 'right', 'bold', COLORS.textMuted);
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(32, HEADER_HEIGHT, width - 64, 2);
  ctx.fillStyle = '#e7e7e7';
  ctx.fillRect(32, HEADER_HEIGHT + 2, width - 64, 2);
}

async function loadSlotImage(slot, cache) {
  const url = slot?.image_url;
  if (!url) return null;
  if (cache.has(url)) return cache.get(url);
  const promise = (async () => {
    try {
      const dl = await downloadImage(url);
      return dl ? await loadImage(dl.buffer) : null;
    } catch {
      return null;
    }
  })();
  cache.set(url, promise);
  return promise;
}

function drawSlotFrame(ctx, x, y, { result = false } = {}) {
  const size = SLOT;
  const fill = result ? COLORS.result : COLORS.slot;
  const dark = result ? COLORS.resultBorder : COLORS.slotDark;

  ctx.fillStyle = dark;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = COLORS.slotLight;
  ctx.fillRect(x + 4, y + 4, size - 4, size - 4);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
  ctx.fillStyle = '#666666';
  ctx.fillRect(x + size - 7, y + 4, 3, size - 8);
  ctx.fillRect(x + 4, y + size - 7, size - 8, 3);
}

async function drawSlot(ctx, slot, x, y, cache, { result = false } = {}) {
  drawSlotFrame(ctx, x, y, { result });
  const img = await loadSlotImage(slot, cache);
  if (img) {
    ctx.imageSmoothingEnabled = false;
    const max = 50;
    let w;
    let h;
    if (img.width <= max && img.height <= max) {
      const scale = Math.max(1, Math.floor(Math.min(max / img.width, max / img.height)));
      w = Math.max(1, Math.min(max, img.width * scale));
      h = Math.max(1, Math.min(max, img.height * scale));
    } else {
      const scale = Math.min(max / img.width, max / img.height);
      w = Math.max(1, Math.round(img.width * scale));
      h = Math.max(1, Math.round(img.height * scale));
    }
    ctx.drawImage(img, Math.round(x + (SLOT - w) / 2), Math.round(y + (SLOT - h) / 2), w, h);
  } else if (slot?.name) {
    drawText(ctx, String(slot.name).slice(0, 2).toUpperCase(), x + SLOT / 2, y + SLOT / 2, 20, 'center', 'bold', '#f5f5f5');
  }

  const qty = Math.max(1, Number(slot?.qty) || 1);
  if ((slot?.name || slot?.image_url) && qty > 1) {
    const label = String(qty);
    drawText(ctx, label, x + SLOT - 7, y + SLOT - 10, 18, 'right', 'bold', '#1b1b1b');
    drawText(ctx, label, x + SLOT - 9, y + SLOT - 12, 18, 'right', 'bold', '#ffffff');
  }
}

function shortName(value, max = 22) {
  const text = String(value || '').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function drawArrow(ctx, x, y) {
  drawText(ctx, '→', x, y, 54, 'center', 'bold', '#494949');
}

function methodsSlots(method) {
  if (method.mode === 'crafting') return Array.from({ length: 9 }, (_, i) => method.grid?.[i] || {});
  if (method.mode === 'furnace' || method.mode === 'smithing') return method.inputs || [];
  return method.materials || [];
}

function markdownLabel(value) {
  return String(value || '').replace(/([\\[\]()])/g, '\\$1');
}

function linkedSlotLabel(slot, fallback, guideLinkBuilder) {
  const label = markdownLabel(slot?.name || fallback);
  const url = typeof guideLinkBuilder === 'function' ? guideLinkBuilder(slot?.guide_link) : null;
  return url ? `[${label}](${url})` : label;
}

export function recipeMethodText(method = {}, { guideLinkBuilder = null } = {}) {
  const labels = {
    trade: 'Intercambio',
    crafting: 'Mesa de crafteo',
    furnace: method.furnace_type === 'blast_furnace' ? 'Alto horno' : method.furnace_type === 'smoker' ? 'Ahumador' : 'Horno normal',
    smithing: 'Mesa de herrería',
  };
  const lines = [`**Modo:** ${labels[method.mode] || 'Método de fabricación'}`];
  const slots = methodsSlots(method).filter(s => s?.name || s?.image_url || s?.guide_link);
  slots.forEach((slot, index) => {
    lines.push(`• ${linkedSlotLabel(slot, `Material ${index + 1}`, guideLinkBuilder)} ×${Math.max(1, Number(slot.qty) || 1)}`);
  });
  if (method.result?.name || method.result?.image_url || method.result?.guide_link) {
    lines.push(`**Resultado:** ${linkedSlotLabel(method.result, 'Resultado', guideLinkBuilder)} ×${Math.max(1, Number(method.result?.qty) || 1)}`);
  }
  return lines.join('\n');
}

async function drawCrafting(ctx, method, cache) {
  const grid = Array.from({ length: 9 }, (_, i) => method.grid?.[i] || {});
  const startX = 50;
  const startY = 80;
  for (let i = 0; i < 9; i++) {
    await drawSlot(ctx, grid[i], startX + (i % 3) * (SLOT + SLOT_GAP), startY + Math.floor(i / 3) * (SLOT + SLOT_GAP), cache);
  }
  drawArrow(ctx, 355, 187);
  await drawSlot(ctx, method.result || {}, 442, 153, cache, { result: true });
  drawText(ctx, shortName(method.result?.name || 'Resultado'), 476, 245, 17, 'center', 'bold');
}

async function drawFurnace(ctx, method, cache) {
  const inputs = method.inputs || [];
  const slotX = 105;
  await drawSlot(ctx, inputs[0] || {}, slotX, 82, cache);
  drawText(ctx, '♨', slotX + SLOT / 2, 194, 34, 'center', 'bold', '#c85b23');
  await drawSlot(ctx, inputs[1] || {}, slotX, 240, cache);
  drawArrow(ctx, 300, 185);
  await drawSlot(ctx, method.result || {}, 380, 151, cache, { result: true });
  drawText(ctx, shortName(method.result?.name || 'Resultado'), 414, 246, 17, 'center', 'bold');
}

async function drawSmithing(ctx, method, cache) {
  const inputs = method.inputs || [];
  const startX = 42;
  const y = 105;
  for (let i = 0; i < 3; i++) {
    await drawSlot(ctx, inputs[i] || {}, startX + i * (SLOT + 26), y, cache);
    if (i < 2) drawText(ctx, '+', startX + SLOT + 13 + i * (SLOT + 26), y + SLOT / 2, 26, 'center', 'bold', '#4a4a4a');
  }
  drawArrow(ctx, 390, y + SLOT / 2);
  await drawSlot(ctx, method.result || {}, 484, y, cache, { result: true });
  drawText(ctx, shortName(method.result?.name || 'Resultado'), 518, 206, 17, 'center', 'bold');
}

async function drawTrade(ctx, method, cache) {
  const materials = (method.materials || []).slice(0, 6);
  const columns = Math.min(3, Math.max(1, materials.length));
  const startX = 42;
  const startY = 82;
  const rowGap = 38;

  for (let i = 0; i < materials.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = startX + col * (SLOT + 38);
    const y = startY + row * (SLOT + rowGap);
    await drawSlot(ctx, materials[i], x, y, cache);
    drawText(ctx, shortName(materials[i]?.name || `Material ${i + 1}`, 15), x + SLOT / 2, y + SLOT + 18, 14, 'center', 'bold');
    if (col < columns - 1 && i < materials.length - 1) {
      drawText(ctx, '+', x + SLOT + 19, y + SLOT / 2, 24, 'center', 'bold', '#4a4a4a');
    }
  }

  drawArrow(ctx, 555, materials.length > 3 ? 170 : 118);
  const resultY = materials.length > 3 ? 136 : 84;
  await drawSlot(ctx, method.result || {}, 635, resultY, cache, { result: true });
  drawText(ctx, shortName(method.result?.name || 'Resultado'), 669, resultY + SLOT + 22, 16, 'center', 'bold');
}

export async function renderWorkbenchMethod(method = {}, title = 'Mesa de trabajo') {
  const { width, height } = canvasSize(method);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  drawPanel(ctx, width, height);
  drawHeader(ctx, title, method, width);

  const cache = new Map();
  if (method.mode === 'crafting') await drawCrafting(ctx, method, cache);
  else if (method.mode === 'furnace') await drawFurnace(ctx, method, cache);
  else if (method.mode === 'smithing') await drawSmithing(ctx, method, cache);
  else await drawTrade(ctx, method, cache);

  return canvas.toBuffer('image/png');
}
