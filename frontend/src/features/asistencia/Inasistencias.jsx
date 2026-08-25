import React, { useCallback, useEffect, useMemo, useState } from 'react'

import AsistenciaService from '../../services/asistencia.service'
import TablaDinamica from './TablaDinamica'
import EnviarMarcas from './EnviarMarcas'
import AvisarJefatura from './AvisarJefatura'
import { descargarCsv } from './exportar'
import { useMorpho, useVista } from './useVista'
import { claveMorpho, construirMarcas, estadoIngreso, indexar, claveAsignacion, claveMarcaje } from './marcas'
import {
  COLUMNAS_INTENTOS,
  aplicarIntentos,
  claveIntento,
  columnasVisibles,
  descargarTemplateIntentos,
  filtrarYOrdenar,
  leerPlanilla,
  normalizarReporte,
  rangoDeReporte,
  validarIntentos,
} from './correccion'

/**
 * Inasistencias: la vista donde se detecta y corrige una inasistencia dudosa.
 *
 * Cruza cuatro fuentes sobre la misma clave rut|fecha — la inasistencia que
 * reporta Buk, la marca del reloj Morpho, el turno asignado y los marcajes ya
 * registrados— para decidir qué filas se pueden corregir y con qué hora.
 */

const insumo = 'block mt-1 text-sm border border-app-line rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-app-ink'
const boton = 'px-3 py-1.5 text-sm border border-app-line rounded hover:bg-app-surface disabled:opacity-40'

const Badge = ({ tono, children }) => {
  const tonos = {
    ok: 'bg-green-50 text-green-700 border-green-200',
    no: 'bg-amber-50 text-amber-700 border-amber-200',
    mudo: 'bg-app-surface text-app-muted border-app-line',
  }
  return (
    <span className={`inline-block px-2 py-0.5 text-xs rounded border whitespace-nowrap ${tonos[tono]}`}>
      {children}
    </span>
  )
}

const ETIQUETA_ESTADO = {
  'sin-turno': ['mudo', 'Sin turno asignado'],
  'turno-invalido': ['mudo', 'Turno ilegible'],
  'ambas-existen': ['ok', 'Ya tiene ambas marcas'],
}

/** Aviso de resultado de un archivo cargado. */
const Aviso = ({ estado }) => {
  if (!estado) return null
  const tonos = {
    ok: 'bg-green-50 text-green-800 border-green-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    error: 'bg-red-50 text-red-800 border-red-200',
  }
  const icono = { ok: '✓', warn: '⚠', error: '✗' }[estado.tipo]
  return (
    <div className={`mt-3 px-3 py-2 text-sm border rounded ${tonos[estado.tipo]}`}>
      {icono} {estado.msg}
    </div>
  )
}

const Inasistencias = ({ desde, hasta, obraId, obras }) => {
  // Modo importador: el reporte subido reemplaza la consulta a la API.
  const [importador, setImportador] = useState(false)
  const [reporte, setReporte] = useState(null)
  const [avisoReporte, setAvisoReporte] = useState(null)

  const [intentos, setIntentos] = useState([])
  const [avisoIntentos, setAvisoIntentos] = useState(null)

  const [seleccion, setSeleccion] = useState({})
  const [sincronizadas, setSincronizadas] = useState(new Set())
  const [enviando, setEnviando] = useState(false)
  const [jefatura, setJefatura] = useState({ respuestas: {}, notificadas: new Set() })

  const api = useVista(importador && reporte ? null : 'inasistencias', { desde, hasta, obraId })
  const data = reporte ?? api

  // Con un reporte cargado el rango sale del archivo: Morpho y los turnos tienen
  // que cruzarse contra las fechas que trae, no contra las del filtro.
  const rango = useMemo(
    () => (reporte ? rangoDeReporte(reporte.rows) : { desde, hasta }),
    [reporte, desde, hasta]
  )

  // Solo las filas sin motivo registrado: una inasistencia con licencia, permiso
  // o vacaciones no se corrige con una marca.
  const columnaMotivo = useMemo(
    () => (data.columns ?? []).find((c) => /motivo/i.test(c)) ?? '',
    [data.columns]
  )
  const rows = useMemo(
    () =>
      columnaMotivo
        ? (data.rows ?? []).filter((r) => String(r[columnaMotivo] ?? '').trim() === '-')
        : data.rows ?? [],
    [data.rows, columnaMotivo]
  )

  const { marcas: marcasMorpho, cargando: cargandoMorpho } = useMorpho(
    rango.desde,
    rango.hasta,
    rows.length > 0
  )

  // Motivos que ya respondió la jefatura, para no volver a preguntar por ellos.
  const cargarJefatura = useCallback(() => {
    if (!rows.length || !rango.desde || !rango.hasta) return
    AsistenciaService.getRespuestasJefatura(rango)
      .then(setJefatura)
      .catch(() => setJefatura({ respuestas: {}, notificadas: new Set() }))
  }, [rows.length, rango.desde, rango.hasta])

  useEffect(() => {
    cargarJefatura()
  }, [cargarJefatura])

  const turnos = useVista(rows.length ? 'asignacion-turnos' : null, { ...rango, obraId })
  const marcajes = useVista(rows.length ? 'marcajes' : null, { ...rango, obraId })

  const turnoPorClave = useMemo(() => indexar(turnos.rows ?? [], claveAsignacion), [turnos.rows])
  const marcajePorClave = useMemo(() => indexar(marcajes.rows ?? [], claveMarcaje), [marcajes.rows])

  const estadoDe = (fila) => estadoIngreso(fila, turnoPorClave, marcajePorClave)

  // "Ya tiene ambas marcas" no es seleccionable: registrar crea una marca nueva,
  // no sobrescribe, así que reenviar duplicaría.
  const seleccionable = (fila) =>
    !sincronizadas.has(claveMorpho(fila)) && estadoDe(fila).tipo === 'ingresar'

  const clavesIntento = useMemo(() => {
    const s = new Set()
    for (const m of intentos) {
      const k = claveIntento(m)
      if (!k.endsWith('|')) s.add(k)
    }
    return s
  }, [intentos])

  const coincidencias = useMemo(
    () =>
      clavesIntento.size === 0
        ? 0
        : rows.reduce((n, r) => n + (clavesIntento.has(claveMorpho(r)) ? 1 : 0), 0),
    [clavesIntento, rows]
  )

  const seleccionadas = useMemo(
    () => rows.filter((r) => seleccion[claveMorpho(r)]),
    [rows, seleccion]
  )

  // La hora sale del turno; si hay un intento real de marcaje que cruce, se usa esa.
  const marcasAEnviar = useMemo(
    () => aplicarIntentos(construirMarcas(seleccionadas, turnos.rows ?? [], marcajes.rows ?? []), intentos),
    [seleccionadas, turnos.rows, marcajes.rows, intentos]
  )

  const columnas = useMemo(() => {
    const seleccionCol = {
      id: 'seleccion',
      header: '',
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
          title={row.getCanSelect() ? 'Seleccionar para corregir' : 'Esta fila no genera marcas'}
        />
      ),
    }
    const morpho = {
      id: 'marca_morpho',
      header: '¿Marca Morpho?',
      accessorFn: (r) => (marcasMorpho?.has(claveMorpho(r)) ? 'sí marca' : 'sin marca'),
      cell: ({ row }) =>
        cargandoMorpho ? (
          <span className="text-app-muted">…</span>
        ) : marcasMorpho?.has(claveMorpho(row.original)) ? (
          <Badge tono="ok">✓ Sí marca</Badge>
        ) : (
          <Badge tono="no">⚠ Sin marca</Badge>
        ),
    }
    const estado = {
      id: 'estado_ingreso',
      header: 'Estado ingreso',
      accessorFn: (r) => estadoDe(r).tipo,
      cell: ({ row }) => {
        const e = estadoDe(row.original)
        if (e.tipo === 'ingresar') {
          const que = e.entrada && e.salida ? 'entrada y salida' : e.entrada ? 'entrada' : 'salida'
          return <Badge tono="no">Falta {que}</Badge>
        }
        const [tono, texto] = ETIQUETA_ESTADO[e.tipo]
        return <Badge tono={tono}>{texto}</Badge>
      },
    }
    const intento = {
      id: 'intento_marcaje',
      header: 'Intento marcaje',
      accessorFn: (r) => (clavesIntento.has(claveMorpho(r)) ? 'con intento' : ''),
      cell: ({ row }) =>
        clavesIntento.has(claveMorpho(row.original)) ? (
          <Badge tono="ok">✓ Con intento</Badge>
        ) : (
          <span className="text-app-muted">—</span>
        ),
    }
    const jefaturaCol = {
      id: 'jefatura',
      header: 'Jefatura',
      accessorFn: (r) => {
        const k = claveMorpho(r)
        return jefatura.respuestas[k] ?? (jefatura.notificadas.has(k) ? 'enviado' : '')
      },
      cell: ({ row }) => {
        const k = claveMorpho(row.original)
        const motivo = jefatura.respuestas[k]
        if (motivo) return <Badge tono="ok">{motivo}</Badge>
        if (jefatura.notificadas.has(k)) return <Badge tono="mudo">✉ Enviado</Badge>
        return <span className="text-app-muted">—</span>
      },
    }
    const sync = {
      id: 'sincronizacion',
      header: 'Sincronización',
      accessorFn: (r) => (sincronizadas.has(claveMorpho(r)) ? 'sincronizado' : ''),
      cell: ({ row }) =>
        sincronizadas.has(claveMorpho(row.original)) ? (
          <Badge tono="ok">✓ Sincronizado</Badge>
        ) : (
          <span className="text-app-muted">—</span>
        ),
    }
    const base = (data.columns ?? []).map((c) => ({
      accessorKey: c,
      header: c.replace(/_/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase()),
      cell: (info) => {
        const v = info.getValue()
        return (
          <span className="text-sm text-app-ink whitespace-nowrap">
            {v === null || v === undefined || v === '' ? '—' : String(v)}
          </span>
        )
      },
    }))
    return clavesIntento.size > 0
      ? [seleccionCol, morpho, estado, intento, jefaturaCol, sync, ...base]
      : [seleccionCol, morpho, estado, jefaturaCol, sync, ...base]
  }, [data.columns, marcasMorpho, cargandoMorpho, clavesIntento, sincronizadas, jefatura,
      turnoPorClave, marcajePorClave])

  const cargarIntentos = async (file) => {
    if (!file) {
      setIntentos([])
      setAvisoIntentos(null)
      return
    }
    try {
      const crudas = await leerPlanilla(file)
      const diag = validarIntentos(crudas)
      if (!diag.ok) {
        setIntentos([])
        setAvisoIntentos({
          tipo: 'error',
          msg:
            diag.total === 0
              ? 'El archivo no tiene filas de datos.'
              : `Archivo no válido. Faltan columnas: ${diag.faltantes.join(', ')}. Se esperaban: ${COLUMNAS_INTENTOS.join(' · ')}.`,
        })
        return
      }
      setIntentos(filtrarYOrdenar(crudas))
      const problemas = []
      if (diag.fechasInvalidas) problemas.push(`${diag.fechasInvalidas} con fecha ilegible`)
      if (diag.rutsInvalidos) problemas.push(`${diag.rutsInvalidos} con RUT inválido`)
      setAvisoIntentos({
        tipo: problemas.length ? 'warn' : 'ok',
        msg: `${file.name} — ${diag.validas}/${diag.total} filas válidas` +
          (problemas.length ? ` (${problemas.join(', ')})` : ''),
      })
    } catch (e) {
      setIntentos([])
      setAvisoIntentos({ tipo: 'error', msg: `No se pudo leer: ${e.message}` })
    }
  }

  const cargarReporte = async (file) => {
    if (!file) {
      setReporte(null)
      setAvisoReporte(null)
      return
    }
    try {
      const { rows: normalizadas, columns, diag } = normalizarReporte(await leerPlanilla(file))
      if (!diag.ok) {
        setReporte(null)
        setAvisoReporte({ tipo: 'error', msg: diag.error })
        return
      }
      setReporte({ rows: normalizadas, columns: columnasVisibles(columns), descartados: 0 })
      setSeleccion({})
      const descartadas = diag.total - diag.validas
      setAvisoReporte({
        tipo: descartadas ? 'warn' : 'ok',
        msg:
          `${file.name} — ${diag.validas}/${diag.total} filas cargadas (RUT: “${diag.rutCol}”` +
          (diag.fechaCol ? `, fecha: “${diag.fechaCol}”)` : ', fecha: ano/mes/dia)') +
          (descartadas ? ` — ${descartadas} descartadas por RUT o fecha ilegible.` : '.'),
      })
    } catch (e) {
      setReporte(null)
      setAvisoReporte({ tipo: 'error', msg: `No se pudo leer: ${e.message}` })
    }
  }

  const alternarImportador = () => {
    setImportador((v) => {
      if (v) {
        setReporte(null)
        setAvisoReporte(null)
        setSeleccion({})
      }
      return !v
    })
  }

  // Selección masiva: suma a lo ya seleccionado, y solo filas que generan marcas.
  const marcar = (filas) =>
    setSeleccion((sel) => ({
      ...sel,
      ...Object.fromEntries(filas.map((r) => [claveMorpho(r), true])),
    }))

  const conMarca = rows.filter((r) => marcasMorpho?.has(claveMorpho(r)) && seleccionable(r))
  const conIntento = rows.filter((r) => clavesIntento.has(claveMorpho(r)) && seleccionable(r))

  const registrar = async () => {
    setEnviando(true)
    try {
      const r = await AsistenciaService.registrarMarcas(
        obraId,
        marcasAEnviar.map(({ rut, i, fecha, hora, mov }) => ({ rut, i, fecha, hora, mov }))
      )
      // En dry-run nada se registró: no marcamos las filas como sincronizadas.
      if (!r.dry_run) {
        setSincronizadas((s) => new Set([...s, ...seleccionadas.map(claveMorpho)]))
        setSeleccion({})
      }
      return r
    } finally {
      setEnviando(false)
    }
  }

  const exportar = () =>
    descargarCsv(
      rows.map((r) => ({
        '¿Marca Morpho?': marcasMorpho?.has(claveMorpho(r)) ? 'Sí marca' : 'Sin marca',
        ...r,
      })),
      ['¿Marca Morpho?', ...(data.columns ?? [])],
      'inasistencias'
    )

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button onClick={alternarImportador} className={`${boton} ${importador ? 'bg-app-surface font-medium' : ''}`}
          title="Trabajar con archivos en vez de consultar la API">
          {importador ? '✓ Modo importador' : 'Modo importador'}
        </button>
        <button onClick={exportar} disabled={!rows.length} className={boton}>
          Exportar CSV
        </button>
      </div>

      {importador && (
        <div className="border border-app-line rounded-lg p-4 mb-4">
          <p className="text-sm text-app-ink font-medium mb-1">Reporte de inasistencias por recinto</p>
          <p className="text-sm text-app-muted mb-3">
            Reemplaza la consulta a la API por las filas del archivo, que igual se cruzan con
            Morpho y con los intentos de marcaje. Súbelo tal cual sale del sistema:
            obligatorias <code>RUT</code> y <code>Día</code>; el resto es opcional.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <input type="file" accept=".xls,.xlsx,.csv" className={`${insumo} py-1`}
              onChange={(e) => cargarReporte(e.target.files?.[0])} />
            {reporte && (
              <button className={boton} onClick={() => { setReporte(null); setAvisoReporte(null); setSeleccion({}) }}>
                Quitar reporte
              </button>
            )}
          </div>
          <Aviso estado={avisoReporte} />
        </div>
      )}

      {/* El uploader de intentos vive fuera del modo importador: cruza igual
          contra las filas de la API que contra las del reporte. */}
      <div className="border border-app-line rounded-lg p-4 mb-4">
        <p className="text-sm text-app-ink font-medium mb-1">Intentos de marcaje (opcional)</p>
        <p className="text-sm text-app-muted mb-3">
          Recupera la hora real cuando el colaborador sí intentó marcar. El cruce es por RUT +
          fecha: si coincide se usa la hora del intento, el resto usa la hora del turno.
          Columnas: <code>{COLUMNAS_INTENTOS.join(' · ')}</code>.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <input type="file" accept=".xls,.xlsx,.csv" className={`${insumo} py-1`}
            onChange={(e) => cargarIntentos(e.target.files?.[0])} />
          <button className={boton} onClick={descargarTemplateIntentos}>Descargar template</button>
        </div>
        <Aviso estado={avisoIntentos} />
        {clavesIntento.size > 0 && (
          <p className={`mt-2 text-sm ${coincidencias ? 'text-app-muted' : 'text-amber-700'}`}>
            {coincidencias} de {clavesIntento.size} intentos coinciden con las inasistencias visibles
            {coincidencias === 0 && ' — revisa que los RUT y las fechas calcen con el rango consultado'}.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button onClick={() => marcar(conMarca)} disabled={!conMarca.length} className={boton}
            title="Selecciona las filas con marca en Morpho que se pueden corregir">
            Seleccionar “Sí marca”{conMarca.length ? ` (${conMarca.length})` : ''}
          </button>
          {clavesIntento.size > 0 && (
            <button onClick={() => marcar(conIntento)} disabled={!conIntento.length} className={boton}>
              Seleccionar con intento{conIntento.length ? ` (${conIntento.length})` : ''}
            </button>
          )}
          {seleccionadas.length > 0 && (
            <button onClick={() => setSeleccion({})} className={boton}>
              Deseleccionar todo ({seleccionadas.length})
            </button>
          )}
          <AvisarJefatura
            rows={seleccionadas}
            obraId={obraId}
            obra={obras.find((o) => String(o.id) === String(obraId))?.nombre}
            desde={rango.desde}
            hasta={rango.hasta}
            onEnviado={cargarJefatura}
          />
          <EnviarMarcas
            marcas={marcasAEnviar}
            obra={obras.find((o) => String(o.id) === String(obraId))}
            obraId={obraId}
            enviando={enviando}
            onEnviar={registrar}
          />
        </div>
      )}

      <TablaDinamica
        rows={rows}
        columns={data.columns ?? []}
        columnasPropias={columnas}
        loading={api.loading && !reporte}
        error={reporte ? null : api.error}
        descartados={reporte ? 0 : api.descartados}
        seleccion={seleccion}
        onSeleccion={setSeleccion}
        idDeFila={(fila) => claveMorpho(fila)}
        filaSeleccionable={(row) => seleccionable(row.original)}
        vacio={
          importador && !reporte
            ? 'Sube un reporte para ver registros.'
            : 'Sin inasistencias sin motivo en el rango seleccionado.'
        }
      />
    </div>
  )
}

export default Inasistencias
