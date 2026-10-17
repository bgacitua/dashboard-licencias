import axios from 'axios'

const BASE = '/api/v1/compensaciones'

export const getEstudios = () => axios.get(`${BASE}/estudios`).then((r) => r.data)

export const postMatch = (body) => axios.post(`${BASE}/match`, body).then((r) => r.data)

// cargos=A&cargos=B (sin corchetes), como espera FastAPI
export const getNiveles = (estudio_id, cargos) =>
  axios
    .get(`${BASE}/niveles`, { params: { estudio_id, cargos }, paramsSerializer: { indexes: null } })
    .then((r) => r.data)

export const postResultado = (analisisId, body) =>
  axios.post(`${BASE}/analisis/${analisisId}/resultado`, body).then((r) => r.data)
