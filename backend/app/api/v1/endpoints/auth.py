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
    UsuarioResponse,
    PreAuthResponse,
    SetupRequiredResponse,
    TwoFactorVerifyRequest,
    TwoFactorSetupResponse,
    TwoFactorVerifySetupRequest,
    TwoFactorDisableRequest,
    TwoFactorInitializeRequest,
    TwoFactorActivateRequest,
    EmailOTPVerifyRequest,
    QRTokenResponse,
)
from app.core.security import (
    get_current_user,
    create_pre_auth_token,
    decode_pre_auth_token,
    create_setup_token,
    decode_setup_token,
    create_qr_token,
    decode_qr_token,
)
from app.models.auth import Usuario

router = APIRouter()


@router.post("/login")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Autenticar usuario. Si tiene 2FA activo retorna pre_auth_token;
    si no, retorna JWT completo con datos de usuario y módulos.
    """
    auth_service = AuthService(db)

    user = auth_service.authenticate(form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.totp_enabled:
        pre_auth_token = create_pre_auth_token(user.id, user.username)
        return PreAuthResponse(pre_auth_token=pre_auth_token)

    # 2FA obligatorio — enviar OTP al email corporativo del usuario
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta no tiene email registrado. Contacta al administrador."
        )
    auth_service = AuthService(db)
    try:
        auth_service.send_setup_otp(user)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    setup_token = create_setup_token(user.id, user.username)
    return SetupRequiredResponse(setup_token=setup_token)


@router.post("/2fa/verify", response_model=AuthResponse)
async def verify_2fa(
    request: TwoFactorVerifyRequest,
    db: Session = Depends(get_db)
):
    """Verifica código TOTP y retorna JWT completo si es correcto."""
    payload = decode_pre_auth_token(request.pre_auth_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado"
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

    auth_service = AuthService(db)
    if not auth_service.verify_totp(user, request.code):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Código de verificación incorrecto"
        )

    access_token = auth_service.create_token_for_user(user)
    modules = auth_service.get_user_modules(user)

    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=UsuarioResponse.model_validate(user),
        modulos=[ModuloResponse.model_validate(m) for m in modules]
    )


@router.post("/2fa/verify-email-otp", response_model=QRTokenResponse)
async def verify_email_otp(
    request: EmailOTPVerifyRequest,
    db: Session = Depends(get_db)
):
    """
    Verifica el OTP enviado al email corporativo.
    Si es válido, retorna qr_token que permite ver el QR y activar TOTP.
    """
    payload = decode_setup_token(request.setup_token)
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    auth_service = AuthService(db)
    if not auth_service.verify_setup_otp(user, request.otp_code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código incorrecto o expirado. Verifica tu correo o solicita uno nuevo."
        )

    return QRTokenResponse(qr_token=create_qr_token(user.id, user.username))


@router.post("/2fa/resend-otp", response_model=SetupRequiredResponse)
async def resend_email_otp(
    request: TwoFactorInitializeRequest,
    db: Session = Depends(get_db)
):
    """Reenvía OTP al email. Acepta qr_token o setup_token — cualquiera del flujo."""
    payload = decode_setup_token(request.qr_token) or decode_qr_token(request.qr_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión expirada.")
    user = db.query(Usuario).filter(Usuario.id == payload["user_id"], Usuario.activo == True).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    auth_service = AuthService(db)
    try:
        auth_service.send_setup_otp(user)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    return SetupRequiredResponse(setup_token=create_setup_token(user.id, user.username))


@router.post("/2fa/initialize", response_model=TwoFactorSetupResponse)
async def initialize_2fa(
    request: TwoFactorInitializeRequest,
    db: Session = Depends(get_db)
):
    """Genera QR TOTP. Requiere qr_token (email OTP ya verificado)."""
    payload = decode_qr_token(request.qr_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado. Inicia sesión nuevamente."
        )
    user = db.query(Usuario).filter(
        Usuario.id == payload["user_id"],
        Usuario.activo == True
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")
    auth_service = AuthService(db)
    return auth_service.generate_totp_setup(user)


@router.post("/2fa/activate", response_model=AuthResponse)
async def activate_2fa(
    request: TwoFactorActivateRequest,
    db: Session = Depends(get_db)
):
    """Verifica código TOTP, activa 2FA y retorna JWT completo. Requiere qr_token."""
    payload = decode_qr_token(request.qr_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado. Inicia sesión nuevamente."
        )
    user = db.query(Usuario).filter(
        Usuario.id == payload["user_id"],
        Usuario.activo == True
    ).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario no encontrado")

    auth_service = AuthService(db)
    if not auth_service.verify_totp_setup(user, request.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código incorrecto. Verifica que la hora de tu dispositivo esté sincronizada."
        )

    auth_service.repository.update_last_login(user)
    access_token = auth_service.create_token_for_user(user)
    modules = auth_service.get_user_modules(user)

    return AuthResponse(
        access_token=access_token,
        token_type="bearer",
        user=UsuarioResponse.model_validate(user),
        modulos=[ModuloResponse.model_validate(m) for m in modules]
    )


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
async def setup_2fa(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Regenera QR para usuario ya autenticado (reconfiguración desde perfil)."""
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA ya está activado. Desactívalo primero para reconfigurarlo."
        )
    auth_service = AuthService(db)
    return auth_service.generate_totp_setup(current_user)


@router.post("/2fa/verify-setup")
async def verify_2fa_setup(
    request: TwoFactorVerifySetupRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Confirma el código y activa 2FA definitivamente."""
    auth_service = AuthService(db)
    if not auth_service.verify_totp_setup(current_user, request.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Código incorrecto. Verifica que la hora de tu dispositivo esté sincronizada."
        )
    return {"message": "Verificación en dos pasos activada exitosamente"}


@router.delete("/2fa/disable")
async def disable_2fa(
    request: TwoFactorDisableRequest,
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Desactiva 2FA. Requiere contraseña actual como confirmación."""
    auth_service = AuthService(db)
    if not auth_service.disable_totp(current_user, request.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contraseña incorrecta"
        )
    return {"message": "Verificación en dos pasos desactivada"}


@router.get("/me", response_model=MeResponse)
async def get_current_user_info(
    current_user: Usuario = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Obtener información del usuario actual autenticado."""
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
    """Obtener los módulos a los que el usuario tiene acceso."""
    auth_service = AuthService(db)
    modules = auth_service.get_user_modules(current_user)
    return [ModuloResponse.model_validate(m) for m in modules]


@router.post("/logout")
async def logout():
    """Cierra sesión. El cliente debe eliminar el token localmente."""
    return {"message": "Sesión cerrada exitosamente"}
