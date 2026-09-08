/**
 * Resumen del reporte de HHEE aprobadas: trabajador × estado × tipo de HHEE.
 *
 * La pantalla muestra esto y no el detalle: el detalle son varias filas por
 * registro (una por cambio de estado) y en un mes son miles, ilegibles en una
 * tabla. Para eso está el CSV, que sí exporta el detalle completo.
 *
 * Se cuentan `registroTiempoId` distintos, no filas: un registro puede pasar
 * dos veces por el mismo estado (correcciones suben la `version`) y ahí dos
 * filas siguen siendo un solo registro.
 */
export const COLUMNAS_RESUMEN = ['nombreTrab', 'estadoRegistroTiempo', 'nombreHHEE', 'registros']

export function resumir(rows) {
  const grupos = new Map()
  for (const r of rows) {
    const clave = `${r.nombreTrab}|${r.estadoRegistroTiempo}|${r.nombreHHEE}`
    let g = grupos.get(clave)
    if (!g) {
      g = {
        nombreTrab: r.nombreTrab,
        estadoRegistroTiempo: r.estadoRegistroTiempo,
        nombreHHEE: r.nombreHHEE,
        ids: new Set(),
      }
      grupos.set(clave, g)
    }
    g.ids.add(r.registroTiempoId)
  }
  // Los mas cargados arriba. El desempate recorre las tres claves del grupo:
  // sin eso el orden lo decide el de aparicion de las filas, que cambia entre
  // consultas identicas y hace que la tabla "salte" sin motivo.
  //
  // Campo por campo y no sobre las claves concatenadas: el separador entraria
  // en la comparacion, y '_' ordena antes que cualquier separador razonable
  // ('REGISTRO_APROBADO_PARCIAL' terminaria antes que 'REGISTRO_APROBADO').
  const porClave = (a, b) =>
    a.nombreTrab.localeCompare(b.nombreTrab) ||
    String(a.estadoRegistroTiempo).localeCompare(String(b.estadoRegistroTiempo)) ||
    String(a.nombreHHEE).localeCompare(String(b.nombreHHEE))

  return [...grupos.values()]
    .map(({ ids, ...g }) => ({ ...g, registros: ids.size }))
    .sort((a, b) => b.registros - a.registros || porClave(a, b))
}

// Check: `node frontend/src/features/asistencia/hheeResumen.js`
if (globalThis.process?.argv?.[1]?.endsWith('hheeResumen.js')) {
  const eq = (a, b) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`)
    }
  }
  const fila = (registroTiempoId, nombreTrab, estadoRegistroTiempo, nombreHHEE = '50%') =>
    ({ registroTiempoId, nombreTrab, estadoRegistroTiempo, nombreHHEE })

  eq(resumir([]), [])

  // Dos cambios de estado del MISMO registro: dos grupos de un registro cada uno.
  eq(
    resumir([
      fila(1, 'ana', 'REGISTRO_APROBADO_PARCIAL'),
      fila(1, 'ana', 'REGISTRO_APROBADO'),
    ]),
    [
      { nombreTrab: 'ana', estadoRegistroTiempo: 'REGISTRO_APROBADO', nombreHHEE: '50%', registros: 1 },
      { nombreTrab: 'ana', estadoRegistroTiempo: 'REGISTRO_APROBADO_PARCIAL', nombreHHEE: '50%', registros: 1 },
    ]
  )

  // El mismo registro dos veces en el mismo estado cuenta UNA vez.
  eq(resumir([fila(7, 'bruno', 'REGISTRO_APROBADO'), fila(7, 'bruno', 'REGISTRO_APROBADO')]),
     [{ nombreTrab: 'bruno', estadoRegistroTiempo: 'REGISTRO_APROBADO', nombreHHEE: '50%', registros: 1 }])

  // El tipo de HHEE separa grupos, y ordena el de mas registros primero.
  eq(resumir([
    fila(1, 'ana', 'REGISTRO_APROBADO', '50%'),
    fila(2, 'ana', 'REGISTRO_APROBADO', '50%'),
    fila(3, 'ana', 'REGISTRO_APROBADO', '100%'),
  ]).map((g) => [g.nombreHHEE, g.registros]), [['50%', 2], ['100%', 1]])

  console.log('ok')
}
