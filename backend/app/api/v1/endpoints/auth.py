"""
Endpoints de autenticación.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.services.auth_service import AuthService
from app.schemas.auth import (
    LoginRequest, 
    AuthResponse, 
    MeResponse, 
    ModuloResponse,
    UsuarioResponse
)
from app.core.security import get_current_user
from app.models.auth import Usuario

router = APIRouter()


@router.post("/login", response_model=AuthResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Autenticar usuario y obtener token JWT.
    
    Retorna el token, datos del usuario y módulos a los que tiene acceso.
    """
    auth_service = AuthService(db)
    
    user = auth_service.authenticate(form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generar token
    access_token = auth_service.create_token_for_user(user)
    
    # Obtener módulos permitidos
    modules = auth_service.get_user_modules(user)
    
    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=UsuarioResponse.model_validate(user),
        modulos=[ModuloResponse.model_validate(m) for m in modules]
    )


@router.get("/me", response_model=MeResponse)
async def get_current_user_info(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Obtener información del usuario actual autenticado.
    """
    auth_service = AuthService(db)
    modules = auth_service.get_user_modules(current_user)
    
    return MeResponse(
        user=UsuarioResponse.model_validate(current_user),
        modulos=[ModuloResponse.model_validate(m) for m in modules]
    )


@router.get("/modules", response_model=list[ModuloResponse])
async def get_user_modules(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Obtener los módulos a los que el usuario tiene acceso.
    """
    auth_service = AuthService(db)
    modules = auth_service.get_user_modules(current_user)
    
    return [ModuloResponse.model_validate(m) for m in modules]


@router.post("/logout")
async def logout():
    """
    Cerrar sesión.
    
    Nota: Como usamos JWT stateless, el logout real se hace en el cliente
    eliminando el token. Este endpoint es solo para consistencia de la API.
    """
    return {"message": "Sesión cerrada exitosamente"}
