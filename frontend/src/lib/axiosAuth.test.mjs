/**
 * Chequeo: el JWT solo viaja a nuestra propia API.
 *
 * Ejecutar:  node src/lib/axiosAuth.test.mjs
 *
 * El interceptor de axios es global, asi que una URL absoluta a un tercero
 * (mindicador.cl, en getIndicatorUF) se llevaba el Authorization puesto. Esto
 * fija la regla para que no vuelva a pasar.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fuente = readFileSync(new URL('./axiosAuth.js', import.meta.url), 'utf8');

// Se extrae la funcion del archivo real en vez de copiarla: una copia se
// desincroniza del original y el chequeo pasaria mintiendo.
const cuerpo = fuente.match(/const esNuestraApi = ([^;]+);/)[1];
globalThis.window = { location: { origin: 'https://personas.cramer.cl' } };
const esNuestraApi = eval(cuerpo);

// Nuestra API: relativas y absolutas al mismo origen.
assert.equal(esNuestraApi('/api/v1/finiquitos/123'), true);
assert.equal(esNuestraApi('https://personas.cramer.cl/api/v1/auth/me'), true);

// Terceros: nunca.
assert.equal(esNuestraApi('https://mindicador.cl/api/uf'), false);
assert.equal(esNuestraApi('https://evil.example/roba'), false);
assert.equal(esNuestraApi('http://personas.cramer.cl.evil.example/'), false);
assert.equal(esNuestraApi(undefined), false);

console.log('OK: el JWT solo se adjunta a llamadas de nuestra propia API.');
