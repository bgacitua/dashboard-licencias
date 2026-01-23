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
    ModuloResponse
)
from app.core.security import require_role
from app.models.auth import Usuario

router = APIRouter()


# === Gestión de Usuarios ===

@router.get("/users", response_model=List[UsuarioResponse])
async def list_users(
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Listar todos los usuarios del sistema."""
    auth_service = AuthService(db)
    users = auth_service.get_all_users()
    return [UsuarioResponse.model_validate(u) for u in users]


@router.post("/users", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
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
    
    user = auth_service.create_user(
        username=user_data.username,
        password=user_data.password,
        rol_id=user_data.rol_id,
        email=user_data.email,
        nombre_completo=user_data.nombre_completo
    )
    
    return UsuarioResponse.model_validate(user)


@router.get("/users/{user_id}", response_model=UsuarioResponse)
async def get_user(
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
async def update_user(
    user_id: int,
    user_data: UsuarioUpdate,
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Actualizar un usuario existente."""
    auth_service = AuthService(db)
    
    user = auth_service.update_user(
        user_id=user_id,
        email=user_data.email,
        nombre_completo=user_data.nombre_completo,
        rol_id=user_data.rol_id,
        activo=user_data.activo,
        password=user_data.password
    )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado"
        )
    
    return UsuarioResponse.model_validate(user)


@router.delete("/users/{user_id}", response_model=UsuarioResponse)
async def deactivate_user(
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

@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Listar todos los roles disponibles."""
    auth_service = AuthService(db)
    roles = auth_service.get_all_roles()
    return [RoleResponse.model_validate(r) for r in roles]


# === Gestión de Módulos ===

@router.get("/modules", response_model=List[ModuloResponse])
async def list_modules(
    current_user: Usuario = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Listar todos los módulos (activos e inactivos)."""
    auth_service = AuthService(db)
    modules = auth_service.get_all_modules(only_active=False)
    return [ModuloResponse.model_validate(m) for m in modules]


@router.put("/modules/{module_id}/toggle")
async def toggle_module(
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
