// src/utils/emojiText.js
// Dibujo de texto mixto (texto normal + emoji) para @napi-rs/canvas.
//
// Skia elige una sola familia para cada llamada a fillText(). Cuando una cadena
// empieza con un emoji y usamos una fuente normal, el emoji se vuelve un cuadro;
// si usamos la fuente de emoji, las letras pueden desaparecer. Estas funciones
// separan la cadena por grafemas y dibujan cada tramo con su fuente correcta.

import { FONT } from './fonts.js';

const graphemeSegmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
const EMOJI_GRAPHEME_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u;

function isEmojiGrapheme(value) {
  return EMOJI_GRAPHEME_RE.test(value) || value.includes('\ufe0f');
}

function splitRuns(value) {
  const text = String(value ?? '');
  const runs = [];

  for (const { segment } of graphemeSegmenter.segment(text)) {
    const emoji = isEmojiGrapheme(segment);
    const previous = runs[runs.length - 1];

    if (previous && previous.emoji === emoji) {
      previous.text += segment;
    } else {
      runs.push({ text: segment, emoji });
    }
  }

  return runs;
}

function emojiFontFrom(textFont) {
  const size = String(textFont || '').match(/(\d+(?:\.\d+)?)px/i)?.[1] || '16';
  return `${size}px "${FONT.emoji}"`;
}

/**
 * Mide una cadena que puede mezclar texto y emoji.
 * Devuelve un número para poder reemplazar directamente ctx.measureText(...).width.
 */
export function measureTextWithEmoji(ctx, value, textFont = ctx.font) {
  const previousFont = ctx.font;
  const emojiFont = emojiFontFrom(textFont);
  let width = 0;

  for (const run of splitRuns(value)) {
    ctx.font = run.emoji ? emojiFont : textFont;
    width += ctx.measureText(run.text).width;
  }

  ctx.font = previousFont;
  return width;
}

/**
 * Dibuja texto mixto respetando ctx.textAlign, ctx.textBaseline y ctx.fillStyle.
 * Restaura la fuente y alineación originales al terminar.
 */
export function fillTextWithEmoji(ctx, value, x, y, textFont = ctx.font) {
  const runs = splitRuns(value);
  if (runs.length === 0) return 0;

  const previousFont = ctx.font;
  const previousAlign = ctx.textAlign;
  const emojiFont = emojiFontFrom(textFont);
  const totalWidth = measureTextWithEmoji(ctx, value, textFont);

  let cursorX = x;
  if (previousAlign === 'center') cursorX -= totalWidth / 2;
  if (previousAlign === 'right' || previousAlign === 'end') cursorX -= totalWidth;

  ctx.textAlign = 'left';
  for (const run of runs) {
    ctx.font = run.emoji ? emojiFont : textFont;
    ctx.fillText(run.text, cursorX, y);
    cursorX += ctx.measureText(run.text).width;
  }

  ctx.font = previousFont;
  ctx.textAlign = previousAlign;
  return totalWidth;
}
