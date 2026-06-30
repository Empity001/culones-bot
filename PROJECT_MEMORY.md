# PROJECT_MEMORY — culones-bot

Registro de sesiones de desarrollo del bot de Discord. Cada entrada resume qué se hizo, qué quedó pendiente y qué problemas se conocen pero no se resolvieron todavía.

---

# Sesión 1

- En el embed que se publica automáticamente cuando se crea o edita un log (`buildLogEmbed`, usado por `logWatcher.js`), los **bloques libres** ahora se muestran completos en vez de resumidos: antes solo aparecía `• Nombre del bloque` en una sola línea compartida; ahora cada bloque libre tiene su propio campo en el embed con todos sus campos/sub-campos, descripción e imagen de referencia (como enlace, ya que un embed solo admite una imagen principal).
- Mobs e items **no se tocaron** — siguen resumidos en una línea cada uno, tal como estaban.
- Se agregó un límite defensivo (19 bloques libres como máximo en el embed) para no exceder el tope de 25 campos por embed que impone Discord; si hay más, se agrega un campo final indicando cuántos quedaron fuera y que se consulten en la web.
- README actualizado para reflejar que mobs/items van resumidos pero los bloques libres van completos.

Pendiente:
- El renderer de canvas usado por `/screenshot logs ver:<log>` (`renderLogDetail.js`) no tiene un tratamiento especial para bloques libres — actualmente mostraría el JSON crudo de `obtained_from` como si fuera texto plano de "dónde se obtiene". No se tocó en esta sesión porque el pedido era específicamente sobre el embed, pero conviene revisarlo pronto para que no se vea roto si alguien usa ese comando sobre un log con bloques libres.

Problemas conocidos:
- Ninguno nuevo identificado en esta sesión.
