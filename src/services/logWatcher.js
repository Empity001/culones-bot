// src/services/logWatcher.js
// =========================================================
// Escucha INSERT y UPDATE en la tabla `logs` vía Supabase Realtime.
// Para cada evento llama a syncLogPublication() que:
//   INSERT → publica resumen + crea hilo + envía páginas
//   UPDATE → edita resumen + sincroniza páginas del hilo
//
// La persistencia de IDs de Discord vive en log_discord_publications
// (tabla separada), nunca en `logs`, para evitar que guardar IDs
// dispare este watcher en loop.
// =========================================================

import { supabase } from './supabase.js';
import { getConfigValue, CONFIG_KEYS } from './botConfig.js';
import { buildLogSummaryEmbed, buildLogPageEmbeds } from '../utils/logEmbeds.js';
import { getPublication, upsertPublication } from './logPublication.js';
import { PermissionFlagsBits } from 'discord.js';

const SITE_URL = process.env.SITE_URL ?? '';

// Guard contra procesamiento simultáneo del mismo log
// (Supabase Realtime puede entregar varios eventos seguidos)
const _processing = new Set();

export function startLogWatcher(client) {
  supabase
    .channel('bot-log-watcher')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logs' },
      async (payload) => {
        const log = payload.new;
        console.log(`[LogWatcher] INSERT detectado: "${log.title}" (${log.id})`);
        if (_processing.has(log.id)) {
          console.log(`[LogWatcher] Ya procesando ${log.id}, ignorando evento duplicado.`);
          return;
        }
        _processing.add(log.id);
        try {
          // Esperar un momento para que mobs/items lleguen a Supabase
          await delay(2500);
          await syncLogPublication(client, log, 'insert');
        } catch (err) {
          console.error(`[LogWatcher] Error en INSERT de "${log.title}":`, err.message);
        } finally {
          _processing.delete(log.id);
        }
      }
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'logs' },
      async (payload) => {
        const log = payload.new;
        console.log(`[LogWatcher] UPDATE detectado: "${log.title}" (${log.id})`);
        if (_processing.has(log.id)) {
          console.log(`[LogWatcher] Ya procesando ${log.id}, ignorando evento duplicado.`);
          return;
        }
        _processing.add(log.id);
        try {
          await syncLogPublication(client, log, 'update');
        } catch (err) {
          console.error(`[LogWatcher] Error en UPDATE de "${log.title}":`, err.message);
        } finally {
          _processing.delete(log.id);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[LogWatcher] ✅ Suscrito a logs (INSERT + UPDATE)');
      } else {
        console.log('[LogWatcher] Estado:', status);
      }
    });
}

// ─────────────────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Carga todos los datos del log desde Supabase. */
async function loadLogData(log) {
  const [catRes, mobsRes, itemsRes] = await Promise.all([
    supabase.from('categories').select('*').eq('slug', log.category).single(),
    supabase.from('log_mobs').select('*').eq('log_id', log.id).order('sort_order', { ascending: true }),
    supabase.from('log_items').select('*').eq('log_id', log.id).order('sort_order', { ascending: true }),
  ]);

  return {
    category: catRes.data ?? null,
    mobs:     mobsRes.data  ?? [],
    items:    itemsRes.data ?? [],
  };
}

/** Obtiene el canal de logs configurado. */
async function getLogChannel(client) {
  const channelId = await getConfigValue(CONFIG_KEYS.LOG_CHANNEL_ID);
  if (!channelId) {
    console.warn('[LogWatcher] No hay canal configurado. Usa /setlogchannel.');
    return null;
  }
  const channel = await client.channels.fetch(channelId).catch((err) => {
    console.warn(`[LogWatcher] No se pudo obtener el canal ${channelId}:`, err.message);
    return null;
  });
  return channel;
}

// ─────────────────────────────────────────────────────────────────────────────
// syncLogPublication — núcleo del sistema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Publica o sincroniza un log en Discord.
 * @param {Client} client
 * @param {object} log     - fila de la tabla logs
 * @param {'insert'|'update'} mode
 */
async function syncLogPublication(client, log, mode) {
  const channel = await getLogChannel(client);
  if (!channel) return;

  const { category, mobs, items } = await loadLogData(log);
  const summaryEmbed = buildLogSummaryEmbed(log, category, mobs, items, SITE_URL);
  const pageEmbeds   = buildLogPageEmbeds(log, category, mobs, items, SITE_URL);

  console.log(`[LogWatcher] "${log.title}": generadas ${pageEmbeds.length} página(s).`);

  const pub = await getPublication(log.id);

  // ── Modo INSERT o publicación no existe ──────────────────────────────────
  if (mode === 'insert' || !pub) {
    await publishFresh(client, channel, log, summaryEmbed, pageEmbeds);
    return;
  }

  // ── Modo UPDATE con publicación existente ────────────────────────────────
  await syncExisting(client, channel, log, pub, summaryEmbed, pageEmbeds);
}

// ─────────────────────────────────────────────────────────────────────────────

/** Publica desde cero: resumen → hilo → páginas. */
async function publishFresh(client, channel, log, summaryEmbed, pageEmbeds) {
  // 1. Enviar el embed resumen al canal principal
  let summaryMessage;
  try {
    summaryMessage = await channel.send({ embeds: [summaryEmbed] });
    console.log(`[LogWatcher] ✅ Resumen enviado (msg: ${summaryMessage.id})`);
  } catch (err) {
    console.error('[LogWatcher] ❌ Error enviando resumen:', err.message);
    return;
  }

  // 2. Crear hilo privado desde el mensaje resumen
  // `invitable: false` → solo el bot (y roles con ManageThreads) pueden invitar
  const threadName = log.title.slice(0, 100); // Discord: max 100 chars para nombre de hilo
  let thread;
  try {
    thread = await summaryMessage.startThread({
      name:                threadName,
      autoArchiveDuration: 10080, // 7 días
      invitable:           false, // hilo privado: solo el bot puede añadir miembros
    });
    console.log(`[LogWatcher] ✅ Hilo privado creado: "${threadName}" (${thread.id})`);
  } catch (err) {
    console.error('[LogWatcher] ❌ Error creando hilo:', err.message);
    await upsertPublication(log.id, channel.id, summaryMessage.id, null, []);
    return;
  }

  // 3. Aplicar permisos: @everyone solo puede leer e historial+reacciones, no escribir
  await applyThreadReadOnlyPerms(thread);

  // 4. Enviar páginas dentro del hilo (una por mensaje)
  const pageIds = await sendPages(thread, pageEmbeds, log.title);

  // 5. Mensaje final con enlace a la web
  await sendFinalLinkMessage(thread, log);

  // 6. Persistir
  await upsertPublication(log.id, channel.id, summaryMessage.id, thread.id, pageIds);
  console.log(`[LogWatcher] ✅ Publicación guardada (${pageIds.length} páginas).`);
}

// ─────────────────────────────────────────────────────────────────────────────

/** Sincroniza una publicación existente: edita lo que existe, crea/borra lo que cambia. */
async function syncExisting(client, channel, log, pub, summaryEmbed, pageEmbeds) {
  // ── 1. Recuperar/reconstruir el mensaje resumen ──────────────────────────
  let summaryMessage = null;

  if (pub.channel_id && pub.channel_id !== channel.id) {
    // El canal cambió desde la última publicación
    console.warn('[LogWatcher] El canal de logs cambió. Reconstruyendo publicación.');
    await publishFresh(client, channel, log, summaryEmbed, pageEmbeds);
    return;
  }

  try {
    summaryMessage = await channel.messages.fetch(pub.summary_message_id);
  } catch {
    console.warn(`[LogWatcher] Mensaje resumen ${pub.summary_message_id} no encontrado — reconstruyendo.`);
    await publishFresh(client, channel, log, summaryEmbed, pageEmbeds);
    return;
  }

  // Editar resumen
  try {
    await summaryMessage.edit({ embeds: [summaryEmbed] });
    console.log(`[LogWatcher] ✅ Resumen editado (msg: ${summaryMessage.id})`);
  } catch (err) {
    console.error('[LogWatcher] ❌ Error editando resumen:', err.message);
  }

  // ── 2. Recuperar o recrear el hilo ───────────────────────────────────────
  let thread = null;

  if (pub.thread_id) {
    thread = await client.channels.fetch(pub.thread_id).catch(() => null);
    if (!thread) {
      console.warn(`[LogWatcher] Hilo ${pub.thread_id} no existe — creando nuevo.`);
    }
  }

  if (!thread) {
    try {
      thread = await summaryMessage.startThread({
        name:                log.title.slice(0, 100),
        autoArchiveDuration: 10080,
        invitable:           false,
      });
      console.log(`[LogWatcher] ✅ Hilo privado recreado: ${thread.id}`);
    } catch (err) {
      console.error('[LogWatcher] ❌ Error recreando hilo:', err.message);
      await upsertPublication(log.id, channel.id, summaryMessage.id, null, []);
      return;
    }
  }

  // Reafirmar privacidad y permisos SIEMPRE — tanto si el hilo se acaba
  // de crear como si ya existía. Esto corrige también hilos publicados
  // antes de que este comportamiento existiera, o que algún admin haya
  // cambiado manualmente en Discord.
  await ensureThreadIsPrivate(thread);
  await applyThreadReadOnlyPerms(thread);

  // Desarchivar si está archivado
  if (thread.archived) {
    await thread.setArchived(false).catch(err =>
      console.warn('[LogWatcher] No se pudo desarchivar el hilo:', err.message)
    );
  }

  // ── 3. Sincronizar páginas ────────────────────────────────────────────────
  const existingIds  = Array.isArray(pub.page_message_ids) ? pub.page_message_ids : [];
  const newPageCount = pageEmbeds.length;
  const oldPageCount = existingIds.length;
  const keepCount    = Math.min(newPageCount, oldPageCount);
  const newIds       = [];

  // Editar las páginas que ya existen
  for (let i = 0; i < keepCount; i++) {
    const msgId = existingIds[i];
    try {
      const msg = await thread.messages.fetch(msgId);
      await msg.edit({ embeds: [pageEmbeds[i]] });
      newIds.push(msg.id);
      console.log(`[LogWatcher] ✅ Página ${i + 1} editada (msg: ${msgId})`);
    } catch {
      // Mensaje fue borrado manualmente — crearlo de nuevo
      console.warn(`[LogWatcher] Página ${i + 1} (${msgId}) no encontrada — recreando.`);
      try {
        const newMsg = await thread.send({ embeds: [pageEmbeds[i]] });
        newIds.push(newMsg.id);
        console.log(`[LogWatcher] ✅ Página ${i + 1} recreada (msg: ${newMsg.id})`);
      } catch (err2) {
        console.error(`[LogWatcher] ❌ Error recreando página ${i + 1}:`, err2.message);
      }
    }
  }

  // Crear páginas nuevas si ahora hay más
  if (newPageCount > oldPageCount) {
    for (let i = oldPageCount; i < newPageCount; i++) {
      try {
        const newMsg = await thread.send({ embeds: [pageEmbeds[i]] });
        newIds.push(newMsg.id);
        console.log(`[LogWatcher] ✅ Página ${i + 1} creada (msg: ${newMsg.id})`);
      } catch (err) {
        console.error(`[LogWatcher] ❌ Error creando página ${i + 1}:`, err.message);
      }
    }
  }

  // Borrar páginas sobrantes si ahora hay menos
  if (oldPageCount > newPageCount) {
    for (let i = newPageCount; i < oldPageCount; i++) {
      const msgId = existingIds[i];
      try {
        const msg = await thread.messages.fetch(msgId);
        await msg.delete();
        console.log(`[LogWatcher] 🗑️  Página ${i + 1} eliminada (msg: ${msgId})`);
      } catch {
        // Ya fue borrado manualmente — ignorar
        console.warn(`[LogWatcher] Página sobrante ${i + 1} (${msgId}) ya no existe, ignorando.`);
      }
    }
  }

  // ── 4. Mensaje final con enlace ───────────────────────────────────────────
  // Nota: en UPDATE no reenviamos el mensaje final para no duplicarlo.
  // Solo lo añadimos si el hilo se acaba de recrear (newIds vacío al empezar).
  // La forma más limpia: siempre intentamos borrarlo si existe y lo reenviamos.
  await sendFinalLinkMessage(thread, log);

  // ── 5. Persistir estado actualizado ──────────────────────────────────────
  await upsertPublication(log.id, channel.id, summaryMessage.id, thread.id, newIds);
  console.log(`[LogWatcher] ✅ Sincronización completada (${newIds.length} páginas).`);
}

// ─────────────────────────────────────────────────────────────────────────────

/** Envía un array de embeds al hilo, uno por mensaje. Devuelve los IDs. */
async function sendPages(thread, pageEmbeds, logTitle) {
  const ids = [];
  for (let i = 0; i < pageEmbeds.length; i++) {
    try {
      const msg = await thread.send({ embeds: [pageEmbeds[i]] });
      ids.push(msg.id);
      console.log(`[LogWatcher] ✅ Página ${i + 1}/${pageEmbeds.length} enviada (msg: ${msg.id})`);
    } catch (err) {
      console.error(`[LogWatcher] ❌ Error enviando página ${i + 1} de "${logTitle}":`, err.message);
    }
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Se asegura de que el hilo sea privado (invitable: false).
 * Necesario para hilos creados antes de este cambio, o que un admin
 * haya modificado manualmente en Discord — el flag `invitable` no se
 * puede fijar solo al crear, también se corrige en cada sincronización.
 */
async function ensureThreadIsPrivate(thread) {
  if (thread.invitable === false) return; // ya está correcto, nada que hacer
  try {
    await thread.edit({ invitable: false });
    console.log(`[LogWatcher] 🔒 Hilo ${thread.id} marcado como privado (invitable: false)`);
  } catch (err) {
    console.warn('[LogWatcher] ⚠️ No se pudo marcar el hilo como privado:', err.message);
  }
}

/**
 * Aplica permisos de solo-lectura + reacciones al hilo para @everyone.
 * El bot conserva todos sus permisos (no se incluye en el override).
 *
 * Permisos que se DENIEGAN a @everyone:
 *   - SendMessages         → no pueden escribir
 *   - SendMessagesInThreads → ídem dentro de hilos (redundante pero explícito)
 *   - CreatePublicThreads / CreatePrivateThreads → no crean sub-hilos
 *
 * Permisos que se PERMITEN a @everyone (ya los tienen por canal, se confirman):
 *   - ViewChannel, ReadMessageHistory, AddReactions
 *
 * Requiere que el bot tenga ManageThreads o ManageRoles en el servidor.
 */
async function applyThreadReadOnlyPerms(thread) {
  try {
    const everyoneId = thread.guild.roles.everyone.id;
    await thread.permissionOverwrites.edit(everyoneId, {
      // Permitir explícitamente leer y reaccionar
      [PermissionFlagsBits.ViewChannel]:           true,
      [PermissionFlagsBits.ReadMessageHistory]:    true,
      [PermissionFlagsBits.AddReactions]:          true,
      // Denegar escritura de cualquier tipo
      [PermissionFlagsBits.SendMessages]:               false,
      [PermissionFlagsBits.SendMessagesInThreads]:      false,
      [PermissionFlagsBits.CreatePublicThreads]:        false,
      [PermissionFlagsBits.CreatePrivateThreads]:       false,
    });
    console.log(`[LogWatcher] 🔒 Permisos solo-lectura aplicados al hilo ${thread.id}`);
  } catch (err) {
    // No fatal — el hilo sigue funcionando, solo queda abierto a escritura
    console.warn('[LogWatcher] ⚠️ No se pudieron aplicar permisos al hilo:', err.message);
    console.warn('[LogWatcher]    Asegúrate de que el bot tenga el permiso "Gestionar hilos" en el servidor.');
  }
}

/**
 * Publica el mensaje final en el hilo con el enlace directo al log en la web.
 * Si ya existe un mensaje final (en UPDATE) lo borra primero para no duplicar.
 * Usa una "firma" reconocible en el contenido para identificarlo.
 */
async function sendFinalLinkMessage(thread, log) {
  const logUrl = SITE_URL
    ? `${SITE_URL.replace(/\/$/, '')}/index.html?log=${log.id}`
    : null;

  const content = logUrl
    ? `📖 Para ver el log más detallado y con imágenes, visita la página.\n${logUrl}`
    : '📖 Para ver el log más detallado y con imágenes, visita la página.';

  // Buscar y eliminar mensajes finales anteriores del bot (para UPDATE)
  try {
    const recent = await thread.messages.fetch({ limit: 10 });
    for (const [, msg] of recent) {
      if (msg.author?.id === thread.client.user?.id && msg.content?.startsWith('📖 Para ver el log')) {
        await msg.delete().catch(() => null);
      }
    }
  } catch {
    // Si no podemos leer mensajes, simplemente enviamos sin borrar
  }

  try {
    await thread.send({ content });
    console.log(`[LogWatcher] ✅ Mensaje final enviado en hilo ${thread.id}`);
  } catch (err) {
    console.warn('[LogWatcher] ⚠️ No se pudo enviar el mensaje final:', err.message);
  }
}
