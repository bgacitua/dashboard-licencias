# Dashboard de Gestión de Licencias Médicas

Este proyecto es una aplicación web empresarial para visualizar el estado de licencias médicas (Vencidas, Por Vencer, Activas), gestionar marcas de empleados, y administrar usuarios y permisos.

**Tech Stack:**

- **Backend:** Python 3.13 + FastAPI + SQL Server (SQLAlchemy)
- **Frontend:** React 18 + Vite + React Router
- **Base de Datos:** SQL Server (2 bases de datos)
- **Autenticación:** JWT (JSON Web Tokens)
- **Despliegue:** Nginx + Linux (Ubuntu/Debian)

---

## Estructura del Proyecto

```
dashboard-licencias/
├── backend/                    # API REST (FastAPI)
│   ├── app/
│   │   ├── api/v1/endpoints/   # Endpoints (auth, admin, licencias, marcas)
│   │   ├── core/               # Config, security, excepciones
│   │   ├── db/                 # Conexiones a BD (2 databases)
│   │   ├── repositories/       # Queries SQL
│   │   ├── services/           # Lógica de negocio
│   │   ├── models/             # Modelos SQLAlchemy
│   │   ├── schemas/            # Schemas Pydantic
│   │   └── main.py             # Punto de entrada
│   ├── .env                    # Variables de entorno (no incluir en git)
│   └── requirements.txt
│
├── frontend/                   # SPA React + Vite
│   ├── src/
│   │   ├── pages/              # Componentes de página
│   │   │   └── admin/          # Panel de administración
│   │   ├── components/         # Componentes reutilizables
│   │   ├── context/            # Context API (AuthContext)
│   │   ├── hooks/              # Custom hooks
│   │   ├── services/           # Llamadas HTTP
│   │   └── App.jsx             # Router principal
│   └── package.json
│
├── ARCHITECTURE.md             # Documentación arquitectónica detallada
├── TODO.md                     # Tareas pendientes
└── README.md                   # Este archivo
```

---

## 1. Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

- **Python 3.9+** (recomendado 3.13)
- **Node.js 18+** y npm
- **Driver ODBC para SQL Server** (Necesario para que Python conecte a la BD):
  - _macOS:_ `brew install msodbcsql18`
  - _Linux:_ Seguir [instrucciones oficiales de Microsoft](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/installing-the-microsoft-odbc-driver-for-sql-server)
  - _Windows:_ Descargar e instalar desde [Microsoft ODBC Driver](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)

---

## 2. Ejecución en Entorno Local (Desarrollo)

Sigue estos pasos para probar la aplicación en tu máquina.

### A. Configurar el Backend

1.  Navega a la carpeta del backend:

    ```bash
    cd backend
    ```

2.  Crea y activa un entorno virtual:

    ```bash
    # Windows
    python -m venv venv
    .\venv\Scripts\activate

    # macOS/Linux
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  Instala las dependencias:

    ```bash
    pip install -r requirements.txt
    ```

4.  Configura las variables de entorno creando un archivo `.env` en `backend/`:

    ```env
    # Base de Datos Principal (Licencias)
    DB_SERVER=tu_servidor
    DB_USER=tu_usuario
    DB_PASSWORD=tu_password
    DB_NAME=nombre_bd_licencias

    # Base de Datos Secundaria (Marcas - MorphoManager)
    MARCAS_DB_SERVER=servidor_marcas
    MARCAS_DB_USER=usuario_marcas
    MARCAS_DB_PASSWORD=password_marcas
    MARCAS_DB_NAME=MorphoManager

    # JWT Secret (cambiar en producción)
    JWT_SECRET_KEY=tu-clave-secreta-super-segura
    JWT_EXPIRE_MINUTES=480
    ```

5.  Ejecuta el servidor:

    ```bash
    python -m uvicorn app.main:app --reload
    ```

    _El backend estará corriendo en:_ `http://localhost:8000`

    > Documentación API disponible en: `http://localhost:8000/docs`

### B. Configurar el Frontend

1.  Abre una nueva terminal y navega a la carpeta del frontend:

    ```bash
    cd frontend
    ```

2.  Instala las librerías de Node:

    ```bash
    npm install
    ```

3.  Ejecuta el servidor de desarrollo:
    ```bash
    npm run dev
    ```
    _El frontend estará disponible en:_ `http://localhost:5173`

---

## 3. Módulos y Funcionalidades

### Autenticación y Permisos

| Rol       | Acceso                                      |
| --------- | ------------------------------------------- |
| `admin`   | Todo el sistema + Gestión de usuarios       |
| `rrhh`    | Dashboard, Licencias, Marcas, Finiquitos    |
| `usuario` | Dashboard, Licencias, Marcas (solo lectura) |

### Módulos Disponibles

| Módulo      | Ruta Frontend | Descripción                         |
| ----------- | ------------- | ----------------------------------- |
| Dashboard   | `/dashboard`  | Resumen de licencias + Marcas       |
| Finiquitos  | `/finiquitos` | Generador de documentos (solo RRHH) |
| Admin Panel | `/admin`      | Gestión de usuarios y módulos       |

---

## 4. Rutas del Frontend

| Ruta                    | Componente          | Protección          |
| ----------------------- | ------------------- | ------------------- |
| `/login`                | Login               | Pública             |
| `/menu`                 | MainMenu            | Autenticado         |
| `/dashboard`            | Dashboard           | Módulo `dashboard`  |
| `/dashboard/vencidas`   | LicenciasVencidas   | Módulo `dashboard`  |
| `/dashboard/por-vencer` | LicenciasPorVencer  | Módulo `dashboard`  |
| `/dashboard/vigentes`   | LicenciasVigentes   | Módulo `dashboard`  |
| `/finiquitos`           | GeneradorFiniquitos | Módulo `finiquitos` |
| `/admin`                | AdminPanel          | Módulo `admin`      |

> **Rutas Legacy:** `/vencidas`, `/por-vencer`, `/vigentes` redirigen automáticamente a `/dashboard/*`

---

## 5. API Endpoints

Base URL: `http://localhost:8000/api/v1`

### Autenticación (`/auth`)

| Método | Ruta       | Descripción              |
| ------ | ---------- | ------------------------ |
| POST   | `/login`   | Autenticar y obtener JWT |
| GET    | `/me`      | Info del usuario actual  |
| GET    | `/modules` | Módulos del usuario      |
| POST   | `/logout`  | Cerrar sesión            |

### Licencias (`/licencias`)

| Método | Ruta                         | Descripción                             |
| ------ | ---------------------------- | --------------------------------------- |
| GET    | `/`                          | Lista todas las licencias (paginado)    |
| GET    | `/vigentes`                  | Licencias activas hoy                   |
| GET    | `/por-vencer?dias=N`         | Licencias que vencen en N días (def: 5) |
| GET    | `/vencidas-recientes?dias=N` | Licencias vencidas hace N días          |
| GET    | `/{id}`                      | Detalle de una licencia                 |
| POST   | `/`                          | Crear licencia                          |

### Marcas (`/marcas`)

| Método | Ruta       | Descripción                     |
| ------ | ---------- | ------------------------------- |
| GET    | `/`        | Marcas con filtros y paginación |
| GET    | `/relojes` | Lista de relojes/torniquetes    |
| GET    | `/hoy`     | Marcas del día (legacy)         |

**Parámetros de filtro (`/marcas`):**

- `limit`, `offset` - Paginación
- `fecha_inicio`, `fecha_fin` - Rango de fechas
- `nombre`, `rut` - Búsqueda por empleado
- `reloj` - Filtro por torniquete
- `tipo_marca` - `IN` o `OUT`

### Administración (`/admin`) - Solo Admins

| Método | Ruta                               | Descripción               |
| ------ | ---------------------------------- | ------------------------- |
| GET    | `/users`                           | Listar usuarios           |
| POST   | `/users`                           | Crear usuario             |
| GET    | `/users/{id}`                      | Obtener usuario           |
| PUT    | `/users/{id}`                      | Actualizar usuario        |
| DELETE | `/users/{id}`                      | Desactivar usuario        |
| GET    | `/roles`                           | Listar roles              |
| GET    | `/modules`                         | Listar módulos            |
| PUT    | `/modules/{id}/toggle?active=bool` | Activar/desactivar módulo |

---

## 6. Despliegue en Servidor Linux (Producción)

Para desplegar esta aplicación en un servidor Linux (ej. Ubuntu) usando Nginx como proxy inverso.

### Paso 1: Backend (Systemd)

1.  Clona el proyecto en el servidor (ej. en `/var/www/dashboard-licencias`).
2.  Instala Python, pip, venv y los drivers ODBC de Microsoft en el servidor.
3.  Crea el entorno virtual e instala dependencias (igual que en local).
4.  Crea un servicio para mantener el backend corriendo. Crea el archivo `/etc/systemd/system/fastapi_app.service`:

    ```ini
    [Unit]
    Description=Gunicorn instance to serve FastAPI Dashboard
    After=network.target

    [Service]
    User=www-data
    Group=www-data
    WorkingDirectory=/var/www/dashboard-licencias/backend
    Environment="PATH=/var/www/dashboard-licencias/backend/venv/bin"
    EnvironmentFile=/var/www/dashboard-licencias/backend/.env
    ExecStart=/var/www/dashboard-licencias/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

    [Install]
    WantedBy=multi-user.target
    ```

5.  Inicia el servicio:
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl start fastapi_app
    sudo systemctl enable fastapi_app
    sudo systemctl status fastapi_app
    ```

### Paso 2: Frontend (Build Estático)

1.  En tu máquina local (o en el servidor si tiene Node), genera los archivos estáticos:
    ```bash
    cd frontend
    npm run build
    ```
2.  Esto creará una carpeta `dist`. Mueve el contenido de esa carpeta `dist` al servidor:
    ```bash
    scp -r dist/* usuario@servidor:/var/www/dashboard-licencias/frontend/dist/
    ```

### Paso 3: Configuración Nginx

Configura Nginx para servir el Frontend y redirigir las llamadas de API al Backend.

1.  Crea la configuración Nginx `/etc/nginx/sites-available/dashboard-licencias`:

    ```nginx
    server {
        listen 80;
        server_name tu_dominio_o_ip;

        # 1. Servir Frontend (React - SPA)
        location / {
            root /var/www/dashboard-licencias/frontend/dist;
            index index.html;
            try_files $uri $uri/ /index.html;
        }

        # 2. Proxy Inverso al Backend (FastAPI)
        location /api {
            proxy_pass http://127.0.0.1:8000;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            # Timeout para conexiones lentas
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }

        # 3. Logs
        access_log /var/log/nginx/dashboard-access.log;
        error_log /var/log/nginx/dashboard-error.log;
    }
    ```

2.  Habilita el sitio y reinicia Nginx:
    ```bash
    sudo ln -s /etc/nginx/sites-available/dashboard-licencias /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

---

## 7. Comandos Útiles

### Backend

```bash
# Ver logs del servicio
sudo journalctl -u fastapi_app -f

# Reiniciar servicio
sudo systemctl restart fastapi_app

# Ver estado
sudo systemctl status fastapi_app
```

### Frontend

```bash
# Build de producción
npm run build

# Preview del build
npm run preview

# Linting
npm run lint
```

---

## 8. Seguridad (Producción)

- [ ] Cambiar `JWT_SECRET_KEY` a un valor aleatorio seguro
- [ ] Configurar HTTPS con Let's Encrypt (Certbot)
- [ ] Configurar firewall (UFW)
- [ ] Cambiar contraseñas de BD a valores seguros
- [ ] Revisar CORS en `main.py` para producción

---

## 9. Troubleshooting

### Error: "Failed to fetch"

- Verificar que el backend esté corriendo
- Revisar configuración CORS
- Verificar conexión a base de datos

### Error: "ODBC Driver not found"

- Instalar el driver ODBC 18 de Microsoft
- Verificar el nombre del driver en `config.py`

### Error: "JWT Token expired"

- El token expira después de 8 horas (configurable)
- Hacer login nuevamente

---

¡Listo! Tu aplicación debería estar accesible en la IP o dominio de tu servidor.
