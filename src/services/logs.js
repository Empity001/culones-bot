// src/services/logs.js
// Carga los logs más recientes (con su categoría) para generar
// una imagen tipo "lista de logs" desde /screenshot.

import { supabase } from './supabase.js';

/**
 * Carga los N logs más recientes junto con los datos de su
 * categoría (emoji, color, label).
 * @param {number} limit
 */
export async function loadRecentLogs(limit = 10) {
  const [logsRes, catsRes] = await Promise.all([
    supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(limit),
    supabase.from('categories').select('*'),
  ]);

  if (logsRes.error) throw new Error(`[Logs] Error cargando logs: ${logsRes.error.message}`);
  if (catsRes.error) throw new Error(`[Logs] Error cargando categorías: ${catsRes.error.message}`);

  const categoriesBySlug = new Map((catsRes.data || []).map((c) => [c.slug, c]));

  return (logsRes.data || []).map((log) => ({
    ...log,
    categoryInfo: categoriesBySlug.get(log.category) || null,
  }));
}
