// src/services/supabase.js
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const key = config.supabase.serviceRoleKey;

// Log de diagnóstico — muestra los primeros y últimos chars de la key
console.log(`[Supabase] URL: ${config.supabase.url}`);
console.log(`[Supabase] Key inicio: ${key?.slice(0, 20)}...${key?.slice(-10)}`);
console.log(`[Supabase] Key length: ${key?.length}`);

export const supabase = createClient(
  config.supabase.url,
  key,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
