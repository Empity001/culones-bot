// src/utils/isAuthorized.js
import { config } from '../config.js';

/**
 * Devuelve true si el userId está en la lista de autorizados.
 * @param {string} userId - Discord user ID
 */
export function isAuthorized(userId) {
  return config.authorizedUserIds.includes(userId);
}
