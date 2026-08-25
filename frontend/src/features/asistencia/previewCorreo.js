/**
 * Vista previa descargable de los correos a jefatura.
 *
 * Con ASISTENCIA_DRY_RUN encendido el backend no manda nada pero sí crea los
 * avisos, así que devuelve el correo tal como saldría y el link real al
 * formulario. Esto arma un HTML con todo junto para revisarlo de una vez.
 */
/** yyyy-mm-dd -> dd-mm-yyyy. Solo para mostrar; el dato sigue siendo ISO. */
export const dmy = (iso) => {
  const p = String(iso ?? '').split('-')
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : String(iso ?? '')
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function previewHtml(previews, { obra = '', desde = '', hasta = '' } = {}) {
  const tarjetas = previews
    .map(
      (p) => `
  <article>
    <header>
      <h2>${esc(p.nombre || p.rut)}</h2>
      <dl>
        <div><dt>RUT</dt><dd>${esc(p.rut)}</dd></div>
        <div><dt>Jefatura</dt><dd>${esc(p.jefatura)}</dd></div>
        <div><dt>Fechas</dt><dd>${esc(p.fechas.map(dmy).join(', '))}</dd></div>
        <div><dt>Asunto</dt><dd>${esc(p.asunto)}</dd></div>
      </dl>
    </header>
    <section class="correo">${p.html}</section>
    <p class="link">
      Formulario que abre la jefatura:
      <a href="${esc(p.url)}" target="_blank" rel="noreferrer">${esc(p.url)}</a>
    </p>
  </article>`
    )
    .join('')

  // El cuerpo del correo se inserta tal cual (viene del backend, ya escapado
  // allá): la gracia es verlo exactamente como llegaría.
  return `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vista previa — avisos a jefatura</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;color:#1f2328}
  h1{font-size:1.4rem;margin-bottom:.25rem}
  .meta{color:#656d76;font-size:.9rem;margin-bottom:2rem}
  article{border:1px solid #d0d7de;border-radius:10px;margin-bottom:1.5rem;overflow:hidden}
  header{background:#f6f8fa;padding:1rem;border-bottom:1px solid #d0d7de}
  header h2{font-size:1.05rem;margin:0 0 .5rem}
  dl{margin:0;display:grid;gap:.25rem;font-size:.9rem}
  dl div{display:flex;gap:.5rem}
  dt{color:#656d76;min-width:5.5rem}
  dd{margin:0}
  .correo{padding:0;background:#f6f8fa;border-bottom:1px solid #d0d7de}
  /* El correo trae sus propios estilos inline, pensados para el motor de Word
     que usa Outlook: nada de acá debe pisarlos. */
  .correo table{border-collapse:collapse}
  .link{padding:0 1rem 1rem;font-size:.9rem;word-break:break-all}
  .aviso{background:#fff8c5;border:1px solid #d4a72c;border-radius:6px;padding:.75rem 1rem;margin-bottom:2rem;font-size:.9rem}
</style>
<h1>Vista previa de avisos a jefatura</h1>
<p class="meta">
  ${esc(previews.length)} correo(s)${obra ? ` · ${esc(obra)}` : ''}${desde ? ` · ${esc(dmy(desde))} → ${esc(dmy(hasta))}` : ''}
  · generado el ${new Date().toLocaleString('es-CL')}
</p>
<p class="aviso">
  <strong>No se envió ningún correo.</strong> Los avisos sí quedaron creados, así que los
  formularios de abajo son reales: se pueden abrir y responder, y la respuesta aparece en la
  columna Jefatura de la tabla.
</p>
${tarjetas}
</html>`
}

export function descargarPreview(previews, contexto) {
  const blob = new Blob([previewHtml(previews, contexto)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `avisos-jefatura_${new Date().toISOString().slice(0, 10)}.html`
  a.click()
  URL.revokeObjectURL(url)
}

// Check: `node frontend/src/features/asistencia/previewCorreo.js`
if (globalThis.process?.argv?.[1]?.endsWith('previewCorreo.js')) {
  const html = previewHtml(
    [{
      jefatura: 'jefe@x.cl', rut: '19117548-9', nombre: 'Ana Soto',
      fechas: ['2026-08-05', '2026-08-06'], asunto: 'Inasistencias — Ana Soto (2 día(s))',
      html: '<p>Hola</p>', url: 'http://local/api/v1/asistencia/notificacion/tok',
    }],
    { obra: 'Cramer Lucerna', desde: '2026-08-01', hasta: '2026-08-31' }
  )
  const tiene = (s) => { if (!html.includes(s)) throw new Error(`falta: ${s}`) }
  tiene('jefe@x.cl')
  tiene('19117548-9')
  tiene('05-08-2026, 06-08-2026')
  tiene('01-08-2026 → 31-08-2026')
  tiene('http://local/api/v1/asistencia/notificacion/tok')
  tiene('No se envió ningún correo')
  if (dmy('2026-08-05') !== '05-08-2026') throw new Error('dmy')
  if (dmy('basura') !== 'basura') throw new Error('dmy con basura')
  // Los datos de la tarjeta se escapan; el cuerpo del correo entra tal cual.
  const conScript = previewHtml([{
    jefatura: 'a@x.cl', rut: '1', nombre: '<script>alert(1)</script>',
    fechas: [], asunto: 'x', html: '<p>ok</p>', url: 'http://x',
  }])
  if (conScript.includes('<script>alert(1)</script>')) throw new Error('nombre sin escapar')
  console.log('ok')
}
