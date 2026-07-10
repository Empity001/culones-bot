// src/services/logPublication.js
// =========================================================
// CRUD para log_discord_publications.
// Toda interacción con la tabla de persistencia pasa por aquí
// — si algo falla al guardar, logueamos pero no rompemos el flujo.
// =========================================================

import { supabase } from './supabase.js';

const TABLE = 'log_discord_publications';

/**
 * Lee la publicación guardada de un log.
 * @param {string} logId
 * @returns {Promise<object|null>}
 */
export async function getPublication(logId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('log_id', logId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    console.error(`[Publication] Error leyendo publicación de ${logId}:`, error.message);
  }
  return data ?? null;
}

/**
 * Guarda o actualiza la publicación de un log.
 * @param {string}   logId
 * @param {string}   channelId
 * @param {string}   summaryMessageId
 * @param {string|null} threadId
 * @param {string[]} pageMessageIds   - IDs ordenados de mensajes de páginas
 */
export async function upsertPublication(logId, channelId, summaryMessageId, threadId, pageMessageIds) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({
      log_id:             logId,
      channel_id:         channelId,
      summary_message_id: summaryMessageId,
      thread_id:          threadId ?? null,
      page_message_ids:   pageMessageIds ?? [],
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'log_id' });

  if (error) {
    console.error(`[Publication] Error guardando publicación de ${logId}:`, error.message);
  }
}

/**
 * Elimina la publicación registrada de un log.
 * Útil cuando se reconstruye todo desde cero.
 */
export async function deletePublication(logId) {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('log_id', logId);

  if (error) {
    console.error(`[Publication] Error eliminando publicación de ${logId}:`, error.message);
  }
}
