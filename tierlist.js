-- sql/bot_tables.sql
-- Ejecuta esto en el SQL Editor de Supabase (una sola vez).
-- Crea las dos tablas que necesita el bot.

-- ── 1. Códigos de administrador ────────────────────────────────────────────────
create table if not exists public.admin_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  active      boolean not null default true,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Solo el service_role (el bot) puede leer/escribir códigos.
-- La web usa la función validate_admin_code que ya existe.
alter table public.admin_codes enable row level security;

-- Nadie puede leer códigos desde el cliente (la web valida via función RPC)
create policy "No public read on admin_codes"
  on public.admin_codes for select using (false);

-- ── 2. Configuración persistente del bot ──────────────────────────────────────
create table if not exists public.bot_config (
  key    text primary key,
  value  text not null
);

alter table public.bot_config enable row level security;

-- Solo el bot (service_role) puede leer/escribir la config
create policy "No public access to bot_config"
  on public.bot_config for all using (false);

-- ── Nota ──────────────────────────────────────────────────────────────────────
-- La función `validate_admin_code` ya existe en tu Supabase desde la web.
-- El bot la llama para validar que un código es correcto ANTES de dar acceso.
-- Si quieres que el bot también pueda rotarla internamente (opcional), aquí
-- está la función de rotación directa que usa el servicio adminCode.js:
--
-- No necesitas ninguna función adicional. El bot usa service_role y escribe
-- directamente en la tabla admin_codes.
