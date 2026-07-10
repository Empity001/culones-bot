-- sql/migration_publications_delete_sync.sql
-- =========================================================
-- Habilita que el bot se entere cuando se borra un log, para
-- poder borrar también su mensaje/hilo en Discord.
--
-- CÓMO FUNCIONA:
-- `log_discord_publications.log_id` tiene `references logs(id)
-- on delete cascade`, así que al borrar un log desde la web
-- (delete_log), Postgres borra automáticamente la fila de
-- publicación correspondiente en la misma transacción.
--
-- Ese borrado en cascada es, para Postgres, un DELETE real
-- sobre `log_discord_publications` — así que si esta tabla
-- está en la publicación de Realtime, el bot recibe un evento
-- DELETE normal para ella, sin tener que tocar la tabla `logs`
-- ni sus permisos.
--
-- El único detalle es REPLICA IDENTITY: por defecto, un evento
-- DELETE solo trae la clave primaria en el "old row". Con
-- REPLICA IDENTITY FULL, Postgres incluye la fila completa
-- (channel_id, summary_message_id, thread_id...), que es
-- justo lo que el bot necesita para borrar el mensaje/hilo
-- SIN tener que consultar la base de datos después (la fila
-- ya no existe para ese momento).
--
-- Ejecuta en: Supabase Dashboard → SQL Editor → New query
-- Seguro de correr más de una vez.
-- =========================================================

alter table public.log_discord_publications replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'log_discord_publications'
  ) then
    alter publication supabase_realtime add table public.log_discord_publications;
  end if;
end $$;
