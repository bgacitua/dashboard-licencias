/**
 * Chequeo: las noticias del carrusel del acuse.
 *
 * Ejecutar:  node src/features/tickets/noticias.test.mjs
 *
 * Va en un archivo aparte y no al final de noticias.js: ese módulo entra al
 * bundle del navegador, y el `await import(...)` del check lo dejaba con un
 * top-level await que rompía `vite build`.
 */
import assert from 'node:assert/strict';

import { INTERVALO_MS, NOTICIAS } from './noticias.js';

// El carrusel pinta `texto` y usa `titulo` solo si está: una noticia sin texto
// saldría como una tarjeta en blanco.
for (const n of NOTICIAS) {
    assert.equal(typeof n.texto, 'string');
    assert.ok(n.texto.trim(), 'cada noticia necesita texto');
    if ('titulo' in n) assert.equal(typeof n.titulo, 'string');
}
// Los puntos de navegación usan `texto` como key de React.
assert.equal(new Set(NOTICIAS.map((n) => n.texto)).size, NOTICIAS.length);
assert.ok(INTERVALO_MS >= 1000, 'un intervalo corto hace ilegible el carrusel');

console.log('noticias: ok');
