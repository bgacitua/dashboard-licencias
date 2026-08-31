"""
Endpoints de autenticación.
"""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import check_rate_limit, client_ip, reset_rate_limit
from app.db.deps import get_db
from app.services.auth_service import AuthService
from app.schemas.auth import (
    LoginRequest,
    AuthResponse,
    MeResponse,
    ModuloResponse,
    UsuarioResponse,
    PreAuthResponse,
    DuoCallbackRequest,
    SetPasswordRequest,
)
from app.core.security import (
    get_current_user,
    create_pre_auth_token,
    decode_pre_auth_token,
)
from app.services import duo_service
from app.models.auth import Usuario

router = APIRouter()


@router.post("/set-password", status_code=status.HTTP_204_NO_CONTENT)
def set_password_from_invite(
    body: SetPasswordRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """Endpoint público: establece contraseña usando token de invitación."""
    check_rate_limit(f"set-password:ip:{client_ip(request)}", max_attempts=10, window_seconds=900)
    if len(body.password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña debe tener al menos 6 caracteres.")
    auth_service = AuthService(db)
    ok = auth_service.set_password_from_invite(body.token, body.password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El enlace de invitación es inválido o ha expirado.")



@router.post("/login", response_model=PreAuthResponse)
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Paso 1: valida usuario y contraseña.

    La 2FA con Duo es obligatoria para todos, así que la respuesta siempre es
    la URL del prompt de Duo. El JWT de sesión solo se emite en /duo/callback.
    """
    # Dos llaves: la IP frena el barrido de cuentas, el usuario frena el ataque
    # distribuido contra una sola cuenta.
    ip_key = f"login:ip:{client_ip(request)}"
    user_key = f"login:user:{form_data.username.lower()}"
    check_rate_limit(ip_key, max_attempts=20, window_seconds=900)
    check_rate_limit(user_key, max_attempts=8, window_seconds=900)

    auth_service = AuthService(db)
    user = auth_service.authenticate(form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Contraseña correcta: el contador de la cuenta se limpia (el de IP no,
    # para que un atacante no lo resetee con una credencial válida cualquiera).
    reset_rate_limit(user_key)

    # El email corporativo es el identificador del usuario en Duo.
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta no tiene email registrado. Contacta al administrador."
        )

    state = create_pre_auth_token(user.id, user.username, user.email)
    try:
        auth_url = duo_service.create_auth_url(user.email, state)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    return PreAuthResponse(duo_auth_url=auth_url)


@router.post("/duo/callback", response_model=AuthResponse)
def duo_callback(
    request: DuoCallbackRequest,
    db: Session = Depends(get_db)
):
    """
    Paso 2: intercambia el código de Duo y emite el JWT de sesión.

    El `state` es el pre_auth_token firmado que enviamos a Duo; si no valida,
    el callback no proviene de un login iniciado por nosotros.
    """
    payload = decode_pre_auth_token(request.state)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión expirada. Inicia sesión nuevamente."
        )

    user = db.query(Usuario).filter(
        Usuario.id == payload["user_id"],
        Usuario.activo == True
    ).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo"
        )

    # El username va tomado del state firmado, no de la request: así el código
    # de Duo solo puede canjearse contra el usuario que inició este login.
    if not duo_service.verify_duo_code(request.duo_code, payload["duo_username"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo verificar la autenticación en dos pasos."
        )

    auth_service = AuthService(db)
    auth_service.repository.update_last_login(user)
    access_token = auth_service.create_token_for_user(user)
    modules = auth_service.get_user_modules(user)

    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=UsuarioResponse.model_validate(user),
        modulos=[ModuloResponse.model_validate(m) for m in modules]
    )


@router.get("/me", response_model=MeResponse)
def get_current_user_info(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtener información del usuario actual autenticado."""
    auth_service = AuthService(db)
    modules = auth_service.get_user_modules(current_user)

    return MeResponse(
        user=UsuarioResponse.model_validate(current_user),
        modulos=[ModuloResponse.model_validate(m) for m in modules],
        email_test_redirect=settings.EMAIL_TEST_REDIRECT,
    )


@router.get("/modules", response_model=list[ModuloResponse])
def get_user_modules(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtener los módulos a los que el usuario tiene acceso."""
    auth_service = AuthService(db)
    modules = auth_service.get_user_modules(current_user)
    return [ModuloResponse.model_validate(m) for m in modules]


@router.post("/logout")
def logout():
    """Cierra sesión. El cliente debe eliminar el token localmente."""
    return {"message": "Sesión cerrada exitosamente"}
