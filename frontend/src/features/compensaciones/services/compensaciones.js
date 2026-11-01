import axios from 'axios'

const BASE = '/api/v1/compensaciones'

export const getPermisos = () => axios.get(`${BASE}/permisos`).then((r) => r.data)

export const getEstudios = () => axios.get(`${BASE}/estudios`).then((r) => r.data)

export const postMatch = (body) => axios.post(`${BASE}/match`, body).then((r) => r.data)

// cargos=A&cargos=B (sin corchetes), como espera FastAPI
export const getNiveles = (estudio_id, cargos) =>
  axios
    .get(`${BASE}/niveles`, { params: { estudio_id, cargos }, paramsSerializer: { indexes: null } })
    .then((r) => r.data)

export const postResultado = (body) => axios.post(`${BASE}/resultado`, body).then((r) => r.data)

export const postAnalisis = (body) => axios.post(`${BASE}/analisis`, body).then((r) => r.data)

export const deleteAnalisis = (id) => axios.delete(`${BASE}/analisis/${id}`)

export const getHistorial = (estudio_id) =>
  axios.get(`${BASE}/analisis`, { params: { estudio_id } }).then((r) => r.data)

export const getCargosEmpresa = (estudio_id) =>
  axios.get(`${BASE}/cargos-empresa`, { params: { estudio_id } }).then((r) => r.data)

// ---- HAY
export const getHayOpciones = () => axios.get(`${BASE}/hay/opciones`).then((r) => r.data)

export const postHayCalcular = (body) => axios.post(`${BASE}/hay/calcular`, body).then((r) => r.data)

export const postHayEvaluacion = (body) => axios.post(`${BASE}/hay/evaluacion`, body).then((r) => r.data)

export const getHayHistorial = (cargo_empresa_id) =>
  axios.get(`${BASE}/hay/evaluacion`, { params: { cargo_empresa_id } }).then((r) => r.data)
