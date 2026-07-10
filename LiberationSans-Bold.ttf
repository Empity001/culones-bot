// src/services/adminCode.js
// Genera un código aleatorio de 8 caracteres, lo guarda en Supabase
// y expira el anterior. El bot llama a esto al arrancar y cada 24h.

import { randomBytes } from 'crypto';
import { supabase } from './supabase.js';

/** Genera un código alfanumérico legible (sin 0/O/I/l para evitar confusión) */
function generateCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join('');
}

/**
 * Crea un nuevo código admin en Supabase y desactiva el anterior.
 * Devuelve el código generado.
 */
export async function rotateAdminCode() {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Desactivar todos los códigos anteriores
  const { error: deactivateError } = await supabase
    .from('admin_codes')
    .update({ active: false })
    .eq('active', true);

  if (deactivateError) {
    console.error('[AdminCode] Error desactivando códigos anteriores:', deactivateError.message);
  }

  // Insertar el nuevo
  const { error: insertError } = await supabase
    .from('admin_codes')
    .insert({ code, expires_at: expiresAt, active: true });

  if (insertError) {
    throw new Error(`[AdminCode] Error insertando código: ${insertError.message}`);
  }

  console.log(`[AdminCode] ✅ Nuevo código generado, expira: ${expiresAt}`);
  return code;
}

/**
 * Devuelve el código activo actual (para enviarlo al usuario autorizado).
 */
export async function getActiveCode() {
  const { data, error } = await supabase
    .from('admin_codes')
    .select('code, expires_at')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data;
}
