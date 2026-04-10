"""
Script para poblar datos iniciales: roles, módulos, asignaciones y usuario admin.
Ejecutar dentro del contenedor:
    docker exec dashboard-licencias-backend python seed_initial_data.py
"""
import sys
sys.path.insert(0, "/app")

from app.db.session import SessionLocal
from app.models.auth import Role, Usuario, Modulo, rol_modulos
from passlib.context import CryptContext
from sqlalchemy import text

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed():
    db = SessionLocal()
    try:
        # ── Roles ──────────────────────────────────────────────────────────────
        roles_data = [
            {"nombre": "admin",   "descripcion": "Administrador del sistema"},
            {"nombre": "rrhh",    "descripcion": "Recursos Humanos"},
            {"nombre": "usuario", "descripcion": "Usuario estándar"},
        ]
        roles = {}
        for r in roles_data:
            rol = db.query(Role).filter(Role.nombre == r["nombre"]).first()
            if not rol:
                rol = Role(**r)
                db.add(rol)
                db.flush()
                print(f"  [+] Rol creado: {r['nombre']}")
            else:
                print(f"  [=] Rol ya existe: {r['nombre']}")
            roles[r["nombre"]] = rol

        # ── Módulos ────────────────────────────────────────────────────────────
        modulos_data = [
            {"codigo": "dashboard",        "nombre": "Dashboard",         "icono": "dashboard",      "ruta": "/",                    "orden": 1},
            {"codigo": "licencias",        "nombre": "Licencias",         "icono": "description",    "ruta": "/licencias",           "orden": 2},
            {"codigo": "vacaciones",       "nombre": "Vacaciones",        "icono": "beach_access",   "ruta": "/vacaciones",          "orden": 3},
            {"codigo": "finiquitos",       "nombre": "Finiquitos",        "icono": "assignment_turned_in", "ruta": "/finiquitos",   "orden": 4},
            {"codigo": "contract_alerts",  "nombre": "Alertas Contrato",  "icono": "notifications",  "ruta": "/contract-alerts",     "orden": 5},
            {"codigo": "admin",            "nombre": "Administración",    "icono": "admin_panel_settings", "ruta": "/admin",         "orden": 6},
        ]
        modulos = {}
        for m in modulos_data:
            mod = db.query(Modulo).filter(Modulo.codigo == m["codigo"]).first()
            if not mod:
                mod = Modulo(**m)
                db.add(mod)
                db.flush()
                print(f"  [+] Módulo creado: {m['codigo']}")
            else:
                print(f"  [=] Módulo ya existe: {m['codigo']}")
            modulos[m["codigo"]] = mod

        # ── Asignación rol → módulos ───────────────────────────────────────────
        admin_modulos = list(modulos.values())                          # todos
        rrhh_modulos  = [modulos[k] for k in ("dashboard", "licencias", "vacaciones", "finiquitos", "contract_alerts")]
        user_modulos  = [modulos[k] for k in ("dashboard", "licencias", "vacaciones")]

        for rol_name, mods in [("admin", admin_modulos), ("rrhh", rrhh_modulos), ("usuario", user_modulos)]:
            rol = roles[rol_name]
            existing = {m.codigo for m in rol.modulos}
            for mod in mods:
                if mod.codigo not in existing:
                    rol.modulos.append(mod)
                    print(f"  [+] Asignado módulo '{mod.codigo}' a rol '{rol_name}'")

        # ── Usuario admin ──────────────────────────────────────────────────────
        admin = db.query(Usuario).filter(Usuario.username == "admin").first()
        if not admin:
            admin = Usuario(
                username="admin",
                email="admin@cramer.cl",
                password_hash=pwd_context.hash("admin123"),
                nombre_completo="Administrador",
                rol_id=roles["admin"].id,
                activo=True,
            )
            db.add(admin)
            print("  [+] Usuario admin creado (admin / admin123)")
        else:
            print("  [=] Usuario admin ya existe")

        db.commit()
        print("\n✓ Seed completado correctamente.")
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error durante el seed: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed()
