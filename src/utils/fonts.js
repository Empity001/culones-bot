// src/utils/fonts.js
// =========================================================
// Registro centralizado de fuentes para @napi-rs/canvas.
//
// PROBLEMA: En servidores Linux sin entorno gráfico (Railway,
// Render, Fly.io, VPS) el sistema no tiene fuentes GUI
// instaladas. @napi-rs/canvas resuelve 'sans-serif' a nada,
// dibujando texto invisible — las barras/cajas del render
// aparecen pero el texto no se ve.
//
// SOLUCIÓN: Bundlear las fuentes directamente en el repo
// (Liberation Sans, licencia SIL OFL — libre para distribución)
// y registrarlas con GlobalFonts antes del primer render.
//
// USO (en cada renderer, al inicio del archivo):
//   import { ensureFonts, FONT } from './fonts.js';
//   await ensureFonts(); // idempotente, solo carga una vez
//   ctx.font = `bold 16px ${FONT.sans}`;
// =========================================================

import { GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, '../assets/fonts');
const require = createRequire(import.meta.url);

// Nombres de familia tal como los registramos — usar estos
// en todas las llamadas ctx.font para consistencia.
export const FONT = {
  sans: 'CulonesUI',       // Liberation Sans — cuerpo y títulos
  mono: 'CulonesMono',     // Liberation Mono — datos técnicos
  emoji: 'Noto Color Emoji', // emoji a color instalado desde @fontsource/noto-emoji
};

let _registered = false;

/**
 * Registra las fuentes bundleadas con GlobalFonts.
 * Es idempotente: la segunda llamada es un no-op barato.
 * Debe llamarse antes de cualquier operación de renderizado.
 */
export function ensureFonts() {
  if (_registered) return;

  try {
    GlobalFonts.registerFromPath(
      join(FONTS_DIR, 'LiberationSans-Regular.ttf'),
      FONT.sans
    );
    GlobalFonts.registerFromPath(
      join(FONTS_DIR, 'LiberationSans-Bold.ttf'),
      FONT.sans        // mismo family name → bold se activa con 'bold' en ctx.font
    );
    GlobalFonts.registerFromPath(
      join(FONTS_DIR, 'LiberationMono-Regular.ttf'),
      FONT.mono
    );

    // Fontsource divide Noto Color Emoji en subconjuntos unicode. Registramos
    // todos bajo su familia interna real para que funcione igual en Railway,
    // Windows y Linux sin depender de fuentes instaladas en el sistema.
    const emojiRoot = dirname(require.resolve('@fontsource/noto-emoji/package.json'));
    for (let subset = 0; subset <= 9; subset++) {
      GlobalFonts.registerFromPath(
        join(emojiRoot, 'files', `noto-emoji-${subset}-400-normal.woff2`)
      );
    }
    GlobalFonts.registerFromPath(
      join(emojiRoot, 'files', 'noto-emoji-emoji-400-normal.woff2')
    );

    _registered = true;
    console.log('[Fonts] ✓ Fuentes de interfaz y emoji registradas correctamente');
  } catch (err) {
    // Si falla (entorno de dev con fuentes del sistema), logueamos pero no rompemos.
    // El canvas usará el fallback del sistema — en dev está bien, en prod hay que
    // asegurarse de que los TTF estén en src/assets/fonts/.
    console.warn('[Fonts] ⚠ No se pudieron registrar las fuentes bundleadas:', err.message);
    console.warn('[Fonts]   Verificá que src/assets/fonts/*.ttf existan en el repo.');
    _registered = true; // marcar como intentado para no reintentar en loop
  }
}
