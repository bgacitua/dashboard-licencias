### TODO

## Bugs por resolver

1. Filtro de fecha no funciona correctamente al seleccionar un rango de fechas. []
2. Diseñar interfaz para generador de finiquitos.
   - Definir columnas a traer
   - Definir método de cálculo de finiquito
   - Definir información cargada manualmente.

## Guía práctica de desarrollo Frontend / Backend

```
📚 Guía: Conectar Backend con Frontend (4 Capas)
Capa 1: Repository (app/repositories/)
python

# Acceso directo a la Base de Datos

def get_licencia_by_rut(self, rut: str) -> List[Licencia]:
return self.db.query(Licencia).filter(Licencia.rut_trabajador == rut).all()
```

````
Capa 2: Service (app/services/)
```python

# Lógica de negocio

def get_licencia_by_rut(self, rut: str) -> List[LicenciaResponse]:
licencia = self.repository.get_licencia_by_rut(rut)
if not licencia:
raise LicenciaNotFoundError(rut)
return licencia
````

````
Capa 3: Controller (app/api/v1/endpoints/)
```python
@router.get("/rut/{rut}", response_model=List[LicenciaResponse])
def read_licencias_by_rut(rut: str, db: Session = Depends(get_db)):
service = LicenciasService(db)
return service.get_licencia_by_rut(rut)
````

````
Capa 4: Frontend (src/services/)
```javascript
export const getLicenciasByRut = async (rut) => {
const response = await axios.get(`${API_URL}/licencias/rut/${rut}`);
return response.data;
};
````

````
Capa 5: Componente React (src/pages/)
```javascript
import { getLicenciasByRut } from '../services/licencias';
// En el useEffect:
const licencias = await getLicenciasByRut(rut);
setLicencias(licencias);
````

```
🔄 Resumen del Flujo
Usuario hace clic → React llama getLicenciasByRut(rut)
↓
Frontend Service hace GET /api/v1/licencias/rut/{rut}
↓
FastAPI Endpoint recibe la petición
↓
Service ejecuta lógica de negocio
↓
Repository hace query SQL
↓
Respuesta JSON vuelve al React
```
