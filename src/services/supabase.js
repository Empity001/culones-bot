// src/services/supabase.js
// Cliente de Supabase reutilizable en todo el bot.
// Usa service_role para tener acceso completo sin RLS.

import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: { persistSession: false },
  }
);
