"""
Endpoints de administración (solo para rol admin).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.deps import get_db
from app.services.auth_service import AuthService
from app.schemas.auth import (
    UsuarioCreate,
    UsuarioUpdate,
    UsuarioResponse,
    RoleResponse,
    RoleWithModules,
    RoleCreate,
    RoleUpdate,
    ModuloResponse,
)
from app.core.security import require_role
from app.models.auth import Role, Usuario

router = APIRouter()

# El rol admin ya tiene todos los módulos y se gestiona en base de datos. No se
# reparte desde la UI: que la pantalla no lo ofrezca es comodidad, esto es lo
# que de verdad lo impide.
ROL_NO_ASIGNABLE = "admin"


def _es_rol_admin(db: Session, rol_id: int | None) -> bool:
    if rol_id is None:
        return False
    rol = db.query(Role).filter(Role.id == rol_id).first()
    return rol is not None and rol.nombre == ROL_NO_ASIGNABLE


# === Gestión de Usuarios ===

@router.get("/users", response_model=List[UsuarioResponse])
def list_users(
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Listar todos los usuarios del sistema."""
    auth_service = AuthService(db)
    users = auth_service.get_all_users()
    return [UsuarioResponse.model_validate(u) for u in users]


@router.post("/users", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UsuarioCreate,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Crear un nuevo usuario."""
    auth_service = AuthService(db)
    
    # Verificar que el username no exista
    existing = auth_service.repository.get_user_by_username(user_data.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El usuario '{user_data.username}' ya existe"
        )
    
    if _es_rol_admin(db, user_data.rol_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El rol 'admin' no se asigna desde la interfaz. Se otorga en base de datos.",
        )

    if not user_data.password and not user_data.send_invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debe proporcionar una contraseña o activar la opción de invitación por email."
        )

    user = auth_service.create_user(
        username=user_data.username,
        password=user_data.password,
        rol_id=user_data.rol_id,
        email=user_data.email,
        nombre_completo=user_data.nombre_completo,
        modulo_ids=user_data.modulo_ids,
        send_invite=user_data.send_invite,
    )

    return UsuarioResponse.model_validate(user)


@router.post("/users/{user_id}/send-invite", status_code=status.HTTP_204_NO_CONTENT)
def send_user_invite(
    user_id: int,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Regenera y reenvía el email de invitación a un usuario existente."""
    auth_service = AuthService(db)
    try:
        ok = auth_service.resend_invite(user_id)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado o sin email.")


@router.get("/users/{user_id}", response_model=UsuarioResponse)
def get_user(
    user_id: int,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Obtener un usuario por ID."""
    auth_service = AuthService(db)
    user = auth_service.get_user_by_id(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )
    
    return UsuarioResponse.model_validate(user)


@router.put("/users/{user_id}", response_model=UsuarioResponse)
def update_user(
    user_id: int,
    user_data: UsuarioUpdate,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Actualizar un usuario existente."""
    auth_service = AuthService(db)

    actual = auth_service.get_user_by_id(user_id)
    ya_era_admin = actual is not None and actual.rol is not None and actual.rol.nombre == ROL_NO_ASIGNABLE
    if _es_rol_admin(db, user_data.rol_id) and not ya_era_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El rol 'admin' no se asigna desde la interfaz. Se otorga en base de datos.",
        )

    user = auth_service.update_user(
        user_id=user_id,
        email=user_data.email,
        nombre_completo=user_data.nombre_completo,
        rol_id=user_data.rol_id,
        activo=user_data.activo,
        password=user_data.password,
        modulo_ids=user_data.modulo_ids
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )
    
    return UsuarioResponse.model_validate(user)


@router.delete("/users/{user_id}", response_model=UsuarioResponse)
def deactivate_user(
    user_id: int,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Desactivar un usuario (soft delete)."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivarte a ti mismo"
        )
    
    auth_service = AuthService(db)
    user = auth_service.deactivate_user(user_id)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )
    
    return UsuarioResponse.model_validate(user)


# === Gestión de Roles ===

@router.get("/roles", response_model=List[RoleWithModules])
def list_roles(
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Listar todos los roles con sus módulos."""
    auth_service = AuthService(db)
    roles = auth_service.get_all_roles()
    return [RoleWithModules.model_validate(r) for r in roles]


@router.post("/roles", response_model=RoleWithModules, status_code=status.HTTP_201_CREATED)
def create_role(
    role_data: RoleCreate,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Crear un nuevo rol."""
    auth_service = AuthService(db)
    existing = auth_service.repository.get_role_by_name(role_data.nombre)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El rol '{role_data.nombre}' ya existe"
        )
    role = auth_service.create_role(
        nombre=role_data.nombre,
        descripcion=role_data.descripcion,
        modulo_ids=role_data.modulo_ids,
    )
    return RoleWithModules.model_validate(role)


@router.put("/roles/{role_id}", response_model=RoleWithModules)
def update_role(
    role_id: int,
    role_data: RoleUpdate,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Actualizar nombre, descripción y módulos de un rol."""
    auth_service = AuthService(db)
    role = auth_service.update_role(
        role_id=role_id,
        nombre=role_data.nombre,
        descripcion=role_data.descripcion,
        modulo_ids=role_data.modulo_ids,
    )
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rol no encontrado"
        )
    return RoleWithModules.model_validate(role)


# === Gestión de Módulos ===

@router.get("/modules", response_model=List[ModuloResponse])
def list_modules(
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Listar todos los módulos (activos e inactivos)."""
    auth_service = AuthService(db)
    modules = auth_service.get_all_modules(only_active=False)
    return [ModuloResponse.model_validate(m) for m in modules]


@router.put("/modules/{module_id}/toggle")
def toggle_module(
    module_id: int,
    active: bool,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Activar o desactivar un módulo."""
    auth_service = AuthService(db)
    module = auth_service.toggle_module(module_id, active)
    
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Módulo no encontrado"
        )
    
    return {"message": f"Módulo {'activado' if active else 'desactivado'} exitosamente"}
