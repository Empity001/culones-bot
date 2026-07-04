// src/utils/libreFields.js
// Lógica compartida para tratar bloques libres (item_type === '_libre').
// Tanto embeds.js como renderLogDetail.js usan este módulo para parsear
// y formatear el contenido de un bloque libre, evitando duplicación y
// garantizando que los dos puntos de salida cuenten la misma historia.

/**
 * Parsea el campo `obtained_from` de un bloque libre.
 * Ese campo guarda un JSON array tipo [{key, value, subfields:[{key,value}]}].
 * Si el JSON es inválido, está vacío o no es array, devuelve [] en vez de explotar.
 *
 * @param {Object} item - fila de log_items
 * @returns {Array<{key:string, value:string, subfields:Array}>}
 */
export function parseLibreFields(item) {
  const raw = item?.obtained_from;
  if (!raw) return [];

  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Normalización defensiva: si algún campo viene raro, lo dejamos
    // en formato seguro para que ni embeds ni canvas exploten.
    return parsed
      .filter((field) => field && typeof field === 'object')
      .map((field) => ({
        key: field.key != null ? String(field.key) : '',
        value: field.value != null ? String(field.value) : '',
        subfields: Array.isArray(field.subfields)
          ? field.subfields
              .filter((sub) => sub && typeof sub === 'object')
              .map((sub) => ({
                key: sub.key != null ? String(sub.key) : '',
                value: sub.value != null ? String(sub.value) : '',
              }))
          : [],
      }));
  } catch {
    return [];
  }
}

/**
 * Separa los items de un log en dos listas: normales y bloques libres.
 * Los bloques libres no deben aparecer en el conteo ni en la sección
 * ITEMS — tienen su propia sección.
 *
 * @param {Array} items - array completo de items del log
 * @returns {{ normalItems: Array, libres: Array }}
 */
export function splitItems(items) {
  const all = Array.isArray(items) ? items : [];
  return {
    normalItems: all.filter((i) => i.item_type !== '_libre'),
    libres:      all.filter((i) => i.item_type === '_libre'),
  };
}

/**
 * Genera las líneas de texto plano de un bloque libre para el canvas.
 * A diferencia de formatLibreBlockValue (que usa Markdown de Discord),
 * esta versión devuelve un array de objetos { text, indent, style }
 * listos para dibujar en canvas con wrapText posterior.
 *
 * Estilos posibles:
 *   'header'  — nombre del campo en negrita, color de acento
 *   'value'   — valor del campo, color normal
 *   'sub'     — sub-campo indentado
 *   'desc'    — descripción del bloque, cursiva
 *   'img'     — referencia de imagen (URL como leyenda textual)
 *
 * @param {Object} libre - fila de log_items con item_type === '_libre'
 * @returns {Array<{text:string, style:string, indent:number}>}
 */
export function formatLibreForCanvas(libre) {
  const lines = [];
  const fields = parseLibreFields(libre);

  for (const field of fields) {
    if (!field?.key) continue;

    if (field.value) {
      lines.push({ text: `${field.key}:`, style: 'header', indent: 0 });
      lines.push({ text: field.value, style: 'value', indent: 12 });
    } else {
      lines.push({ text: field.key, style: 'header', indent: 0 });
    }

    for (const sub of (field.subfields || [])) {
      if (!sub?.key) continue;
      const subText = sub.value ? `↳ ${sub.key}: ${sub.value}` : `↳ ${sub.key}`;
      lines.push({ text: subText, style: 'sub', indent: 20 });
    }
  }

  if (libre.description) {
    lines.push({ text: libre.description, style: 'desc', indent: 0 });
  }

  if (libre.image_url) {
    // En canvas no hay hipervínculos — mostramos la URL acortada como referencia
    const shortUrl = libre.image_url.length > 60
      ? libre.image_url.slice(0, 58) + '…'
      : libre.image_url;
    lines.push({ text: `🖼 ${shortUrl}`, style: 'img', indent: 0 });
  }

  return lines;
}

/**
 * Calcula la altura en píxeles que ocupa un bloque libre en el canvas,
 * teniendo en cuenta el wrap de texto por ancho y el estilo de cada línea.
 * Se usa en el pre-cálculo de altura del canvas para que nada se corte.
 *
 * @param {Object} ctx       - contexto de canvas (solo para measureText)
 * @param {Object} libre     - fila de log_items
 * @param {number} maxWidth  - ancho disponible para texto
 * @param {string} fontSans  - nombre de la familia de fuente sans
 * @returns {number} altura estimada en píxeles
 */
export function measureLibreHeight(ctx, libre, maxWidth, fontSans) {
  const LINE_H = { header: 18, value: 17, sub: 16, desc: 17, img: 15 };
  // Debe coincidir con renderLogDetail.js:
  // - título del bloque en y + 8
  // - contenido empieza en y + 28
  // - margen inferior para que el texto no toque el borde de la card
  const TITLE_AREA_H = 28;
  const BOTTOM_PADDING = 10;

  const lines = formatLibreForCanvas(libre);

  if (lines.length === 0) {
    // Bloque vacío: título + "Sin campos." + padding inferior
    return TITLE_AREA_H + 18 + BOTTOM_PADDING;
  }

  let h = TITLE_AREA_H + BOTTOM_PADDING;
  for (const line of lines) {
    const effectiveWidth = maxWidth - line.indent;
    ctx.font = `${line.style === 'sub' ? 'italic ' : ''}11px ${fontSans}`;
    const words = line.text.split(/\s+/);
    let current = '';
    let lineCount = 0;
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > effectiveWidth && current) {
        lineCount++;
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lineCount++;
    h += (lineCount || 1) * (LINE_H[line.style] || 17);
  }

  return h;
}
