# Dashboard de Gestión de Licencias Médicas

Este proyecto es una aplicación web para visualizar el estado de licencias médicas (Vencidas, Por Vencer, Activas).

**Tech Stack:**
* **Backend:** Python 3 + FastAPI + SQL Server (SQLAlchemy)
* **Frontend:** React + Vite
* **Base de Datos:** SQL Server
* **Despliegue:** Nginx + Linux (Ubuntu/Debian)

---

## 1. Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:
* **Python 3.9+**
* **Node.js 18+** y npm
* **Driver ODBC para SQL Server** (Necesario para que Python conecte a la BD).
    * *macOS:* `brew install msodbcsql18`
    * *Linux:* Seguir instrucciones oficiales de Microsoft para `msodbcsql17` o `18`.

---

## 2. Ejecución en Entorno Local (Desarrollo)

Sigue estos pasos para probar la aplicación en tu máquina (macOS/Windows).

### A. Configurar el Backend

1.  Navega a la carpeta del backend:
    ```bash
    cd backend
    ```

2.  Crea y activa un entorno virtual:
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # En Windows: venv\Scripts\activate
    ```

3.  Instala las dependencias:
    ```bash
    pip install -r requirements.txt
    ```

4.  Configura las variables de entorno:
    * Asegúrate de tener el archivo `.env` en la carpeta `backend/` con tus credenciales de SQL Server (ver ejemplo en `core/config.py` o crear uno nuevo basado en las instrucciones).

5.  Ejecuta el servidor:
    ```bash
    uvicorn app.main:app --reload
    ```
    *El backend estará corriendo en:* `http://localhost:8000`

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
    *El frontend estará disponible en:* `http://localhost:5173` (o el puerto que indique la consola).

---

## 3. Despliegue en Servidor Linux (Producción)

Para desplegar esta aplicación en un servidor Linux (ej. Ubuntu) usando Nginx como proxy inverso.

### Paso 1: Backend (Systemd)

1.  Clona el proyecto en el servidor (ej. en `/var/www/dashboard-licencias`).
2.  Instala Python, pip, venv y los drivers ODBC de Microsoft en el servidor.
3.  Crea el entorno virtual e instala dependencias (igual que en local).
4.  Crea un servicio para mantener el backend corriendo. Crea el archivo `/etc/systemd/system/fastapi_app.service`:

    ```ini
    [Unit]
    Description=Gunicorn instance to serve FastAPI
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
    sudo systemctl start fastapi_app
    sudo systemctl enable fastapi_app
    ```

### Paso 2: Frontend (Build Estático)

1.  En tu máquina local (o en el servidor si tiene Node), genera los archivos estáticos:
    ```bash
    cd frontend
    npm run build
    ```
2.  Esto creará una carpeta `dist`. Mueve el contenido de esa carpeta `dist` al servidor, por ejemplo a: `/var/www/dashboard-licencias/frontend/dist`.

### Paso 3: Configuración Nginx

Configura Nginx para servir el Frontend y redirigir las llamadas de API al Backend.

1.  Edita tu configuración de Nginx (ej. `/etc/nginx/sites-available/default`):

    ```nginx
    server {
        listen 80;
        server_name tu_dominio_o_ip;

        # 1. Servir Frontend (React)
        location / {
            root /var/www/dashboard-licencias/frontend/dist;
            index index.html;
            try_files $uri $uri/ /index.html;
        }

        # 2. Proxy Inverso al Backend (FastAPI)
        location /api {
            proxy_pass [http://127.0.0.1:8000](http://127.0.0.1:8000);
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
    ```

2.  Reinicia Nginx:
    ```bash
    sudo systemctl restart nginx
    ```

¡Listo! Tu aplicación debería estar accesible en la IP o dominio de tu servidor.