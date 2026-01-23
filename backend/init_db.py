"""
Script para inicializar la base de datos con tablas y datos iniciales.
Ejecutar una sola vez para crear:
- Esquema App
- Tablas: Roles, Usuarios, Modulos, RolModulos
- Usuario admin inicial
- Roles y módulos base

Uso:
    cd backend
    python init_db.py
"""
import sys
import os

# Agregar el directorio padre al path para imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.session import SessionLocal, engine
from app.models.auth import Base, Role, Usuario, Modulo, rol_modulos
from app.core.security import get_password_hash


def create_schema_and_tables():
    """Crea el esquema App y todas las tablas necesarias."""
    
    with engine.connect() as conn:
        # Crear esquema si no existe
        conn.execute(text("""
            IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = 'App')
            BEGIN
                EXEC('CREATE SCHEMA App')
            END
        """))
        conn.commit()
        print("✓ Esquema 'App' verificado/creado")
    
    # Crear tablas usando SQLAlchemy
    Base.metadata.create_all(bind=engine)
    print("✓ Tablas creadas")


def seed_roles(db):
    """Crea los roles base del sistema."""
    roles_data = [
        {"nombre": "admin", "descripcion": "Administrador del sistema con acceso total"},
        {"nombre": "rrhh", "descripcion": "Personal de Recursos Humanos"},
        {"nombre": "usuario", "descripcion": "Usuario básico con acceso limitado"},
    ]
    
    created = 0
    for role_data in roles_data:
        existing = db.query(Role).filter(Role.nombre == role_data["nombre"]).first()
        if not existing:
            role = Role(**role_data)
            db.add(role)
            created += 1
    
    db.commit()
    print(f"✓ Roles: {created} creados, {len(roles_data) - created} ya existían")
    
    return db.query(Role).all()


def seed_modules(db):
    """Crea los módulos base del sistema."""
    modules_data = [
        {
            "codigo": "dashboard",
            "nombre": "Dashboard",
            "descripcion": "Panel de control con licencias y marcas",
            "icono": "📊",
            "ruta": "/dashboard",
            "orden": 1,
            "activo": True
        },
        {
            "codigo": "finiquitos",
            "nombre": "Finiquitos",
            "descripcion": "Generador de documentos de finiquito",
            "icono": "📄",
            "ruta": "/finiquitos",
            "orden": 2,
            "activo": True
        },
        {
            "codigo": "admin",
            "nombre": "Administración",
            "descripcion": "Gestión de usuarios y configuración",
            "icono": "⚙️",
            "ruta": "/admin",
            "orden": 99,
            "activo": True
        },
    ]
    
    created = 0
    for mod_data in modules_data:
        existing = db.query(Modulo).filter(Modulo.codigo == mod_data["codigo"]).first()
        if not existing:
            module = Modulo(**mod_data)
            db.add(module)
            created += 1
    
    db.commit()
    print(f"✓ Módulos: {created} creados, {len(modules_data) - created} ya existían")
    
    return db.query(Modulo).all()


def assign_modules_to_roles(db, roles, modules):
    """Asigna módulos a roles según permisos."""
    
    # Mapeo de permisos: rol -> lista de códigos de módulos
    permissions = {
        "admin": ["dashboard", "finiquitos", "admin"],
        "rrhh": ["dashboard", "finiquitos"],
        "usuario": ["dashboard"],
    }
    
    for role in roles:
        if role.nombre in permissions:
            allowed_codes = permissions[role.nombre]
            for module in modules:
                if module.codigo in allowed_codes:
                    if module not in role.modulos:
                        role.modulos.append(module)
    
    db.commit()
    print("✓ Permisos de módulos asignados a roles")


def create_admin_user(db, roles):
    """Crea el usuario administrador inicial."""
    
    admin_role = next((r for r in roles if r.nombre == "admin"), None)
    if not admin_role:
        print("✗ Error: No se encontró el rol 'admin'")
        return
    
    # Verificar si ya existe un admin
    existing = db.query(Usuario).filter(Usuario.username == "admin").first()
    if existing:
        print("✓ Usuario 'admin' ya existe")
        return existing
    
    # Crear usuario admin
    admin_user = Usuario(
        username="admin",
        email="admin@empresa.com",
        password_hash=get_password_hash("admin123"),  # ⚠️ Cambiar en producción!
        nombre_completo="Administrador del Sistema",
        rol_id=admin_role.id,
        activo=True
    )
    
    db.add(admin_user)
    db.commit()
    
    print("✓ Usuario 'admin' creado")
    print("  ╔═══════════════════════════════════════╗")
    print("  ║  CREDENCIALES INICIALES               ║")
    print("  ╠═══════════════════════════════════════╣")
    print("  ║  Usuario:  admin                      ║")
    print("  ║  Password: admin123                   ║")
    print("  ╠═══════════════════════════════════════╣")
    print("  ║  ⚠️  CAMBIAR PASSWORD EN PRODUCCIÓN!  ║")
    print("  ╚═══════════════════════════════════════╝")
    
    return admin_user


def main():
    print("\n" + "="*50)
    print("  INICIALIZACIÓN DE BASE DE DATOS")
    print("="*50 + "\n")
    
    try:
        # 1. Crear esquema y tablas
        create_schema_and_tables()
        
        # 2. Crear sesión
        db = SessionLocal()
        
        try:
            # 3. Crear roles
            roles = seed_roles(db)
            
            # 4. Crear módulos
            modules = seed_modules(db)
            
            # 5. Asignar permisos
            assign_modules_to_roles(db, roles, modules)
            
            # 6. Crear usuario admin
            create_admin_user(db, roles)
            
            print("\n" + "="*50)
            print("  ✅ INICIALIZACIÓN COMPLETADA")
            print("="*50 + "\n")
            
        finally:
            db.close()
            
    except Exception as e:
        print(f"\n✗ Error durante la inicialización: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
