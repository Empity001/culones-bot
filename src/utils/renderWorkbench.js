import { createCanvas, loadImage } from '@napi-rs/canvas';
import { downloadImage } from './mediaAttachments.js';
import { getRenderPalette, themeRgba } from '../services/siteTheme.js';

const W = 900;
const H = 430;
const SLOT = 86;

function text(ctx, value, x, y, size = 24, align = 'left', weight = 'normal') {
  ctx.font = `${weight} ${size}px "Liberation Sans"`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = getRenderPalette().text;
  ctx.fillText(String(value || ''), x, y);
}

function rounded(ctx, x, y, w, h, r = 16) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

async function slotImage(slot) {
  if (!slot?.image_url) return null;
  try {
    const dl = await downloadImage(slot.image_url);
    return dl ? await loadImage(dl.buffer) : null;
  } catch {
    return null;
  }
}

async function drawSlot(ctx, slot, x, y, { result = false } = {}) {
  rounded(ctx, x, y, SLOT, SLOT, 12);
  const theme = getRenderPalette();
  ctx.fillStyle = result ? themeRgba(theme.primary, 0.34) : theme.elevated;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = result ? theme.primarySoft : themeRgba(theme.primary, 0.62);
  ctx.stroke();
  const img = await slotImage(slot);
  if (img) {
    ctx.imageSmoothingEnabled = false;
    const max = 58;
    const scale = Math.max(1, Math.floor(Math.min(max / img.width, max / img.height)));
    const w = Math.min(max, img.width * scale);
    const h = Math.min(max, img.height * scale);
    ctx.drawImage(img, x + (SLOT - w) / 2, y + (SLOT - h) / 2, w, h);
  } else if (slot?.name) {
    text(ctx, String(slot.name).slice(0, 2).toUpperCase(), x + SLOT / 2, y + SLOT / 2, 22, 'center', 'bold');
  }
  const qty = Math.max(1, Number(slot?.qty) || 1);
  if ((slot?.name || slot?.image_url) && qty > 1) {
    text(ctx, `×${qty}`, x + SLOT - 8, y + SLOT - 14, 18, 'right', 'bold');
  }
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

export async function renderWorkbenchMethod(method = {}, title = 'Mesa de trabajo') {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const theme = getRenderPalette();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, themeRgba(theme.primary, 0.30));
  gradient.addColorStop(1, themeRgba(theme.panel, 0.08));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  text(ctx, title, 42, 42, 28, 'left', 'bold');
  text(ctx, recipeMethodText(method).split('\n')[0].replace(/\*\*/g, ''), 42, 78, 18);

  const result = method.result || {};
  if (method.mode === 'crafting') {
    const grid = Array.from({ length: 9 }, (_, i) => method.grid?.[i] || {});
    const startX = 70, startY = 110;
    for (let i = 0; i < 9; i++) {
      await drawSlot(ctx, grid[i], startX + (i % 3) * (SLOT + 12), startY + Math.floor(i / 3) * (SLOT + 12));
    }
    text(ctx, '→', 470, 235, 66, 'center', 'bold');
    await drawSlot(ctx, result, 570, 190, { result: true });
    text(ctx, result.name || 'Resultado', 613, 310, 20, 'center');
  } else if (method.mode === 'furnace') {
    const inputs = method.inputs || [];
    await drawSlot(ctx, inputs[0] || {}, 170, 105);
    text(ctx, '🔥', 213, 218, 44, 'center');
    await drawSlot(ctx, inputs[1] || {}, 170, 260);
    text(ctx, '→', 450, 215, 66, 'center', 'bold');
    await drawSlot(ctx, result, 590, 170, { result: true });
    text(ctx, result.name || 'Resultado', 633, 292, 20, 'center');
  } else if (method.mode === 'smithing') {
    const inputs = method.inputs || [];
    for (let i = 0; i < 3; i++) await drawSlot(ctx, inputs[i] || {}, 70 + i * (SLOT + 35), 170);
    text(ctx, '+', 178, 213, 32, 'center', 'bold');
    text(ctx, '+', 299, 213, 32, 'center', 'bold');
    text(ctx, '→', 500, 213, 66, 'center', 'bold');
    await drawSlot(ctx, result, 620, 170, { result: true });
    text(ctx, result.name || 'Resultado', 663, 292, 20, 'center');
  } else {
    const materials = (method.materials || []).slice(0, 6);
    const startX = 55;
    const gap = 18;
    for (let i = 0; i < materials.length; i++) {
      await drawSlot(ctx, materials[i], startX + i * (SLOT + gap), 160);
      if (i < materials.length - 1) text(ctx, '+', startX + i * (SLOT + gap) + SLOT + gap / 2, 203, 24, 'center', 'bold');
    }
    text(ctx, '→', 690, 203, 54, 'center', 'bold');
    await drawSlot(ctx, result, 755, 160, { result: true });
    text(ctx, result.name || 'Resultado', 798, 282, 18, 'center');
  }
  return canvas.toBuffer('image/png');
}
