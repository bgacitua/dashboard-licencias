"""
Servicio de autenticación y gestión de usuarios.
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
import pyotp
import qrcode
import io
import base64
import httpx

from app.repositories.auth_repository import AuthRepository
from app.models.auth import Usuario, Modulo, OTPCode
from app.core.security import verify_password, get_password_hash, create_access_token, verify_totp_code
from app.core.logging_config import logger
from app.services.email_token_service import get_access_token, AuthRequiredError


class AuthService:
    """Servicio para lógica de negocio de autenticación."""
    
    def __init__(self, db: Session):
        self.repository = AuthRepository(db)
    
    def authenticate(self, username: str, password: str) -> Optional[Usuario]:
        """
        Autentica un usuario con username y password.
        
        Returns:
            Usuario si las credenciales son válidas, None en caso contrario
        """
        user = self.repository.get_user_by_username(username)
        
        if not user:
            logger.warning(f"Este usuario no existe: {username}")
            return None
        
        if not user.activo:
            logger.warning(f"Este usuario no está activo: {username}")
            return None
        
        if not verify_password(password, user.password_hash):
            logger.warning(f"Contraseña incorrecta para usuario: {username}")
            return None
        
        # Actualizar último login
        self.repository.update_last_login(user)
        logger.info(f"Login exitoso para usuario: {username}")
        
        return user
    
    def create_token_for_user(self, user: Usuario) -> str:
        """
        Crea un JWT para el usuario.
        
        El token incluye el username como 'sub' (subject).
        """
        token_data = {
            "sub": user.username,
            "user_id": user.id,
            "rol": user.rol.nombre if user.rol else None
        }
        return create_access_token(token_data)
    
    def get_user_modules(self, user: Usuario) -> List[Modulo]:
        """
        Obtiene los módulos a los que el usuario tiene acceso.
        """
        if not user.rol:
            return []
        
        return [m for m in user.rol.modulos if m.activo]
    
    # === Gestión de usuarios (para admin) ===
    
    def create_user(
        self,
        username: str,
        password: Optional[str],
        rol_id: int,
        email: Optional[str] = None,
        nombre_completo: Optional[str] = None,
        modulo_ids: Optional[List[int]] = None,
        send_invite: bool = False,
    ) -> Usuario:
        """Crea un nuevo usuario. Si send_invite=True genera token de invitación y envía email."""
        placeholder = secrets.token_hex(32) if not password else password
        password_hash = get_password_hash(placeholder)

        user = self.repository.create_user(
            username=username,
            password_hash=password_hash,
            rol_id=rol_id,
            email=email,
            nombre_completo=nombre_completo
        )

        if modulo_ids:
            self.repository.set_user_modules(user, modulo_ids)

        if send_invite and email:
            self._generate_and_send_invite(user)

        logger.info(f"Usuario creado: {username}")
        return user

    def _generate_and_send_invite(self, user: Usuario) -> None:
        """Genera token de invitación, lo guarda en DB y envía email al usuario."""
        token = secrets.token_urlsafe(32)
        user.invite_token = token
        user.invite_token_expires_at = datetime.utcnow() + timedelta(hours=48)
        self.repository.db.commit()
        self._send_invite_email(user.email, user.nombre_completo or user.username, token)

    def resend_invite(self, user_id: int) -> bool:
        """Regenera y reenvía invitación a un usuario existente. Retorna False si no existe."""
        user = self.repository.get_user_by_id(user_id)
        if not user or not user.email:
            return False
        self._generate_and_send_invite(user)
        return True

    def set_password_from_invite(self, token: str, new_password: str) -> bool:
        """Valida token de invitación y establece la contraseña. Retorna False si token inválido/expirado."""
        user = (
            self.repository.db.query(Usuario)
            .filter(
                Usuario.invite_token == token,
                Usuario.invite_token_expires_at > datetime.utcnow(),
            )
            .first()
        )
        if not user:
            return False
        user.password_hash = get_password_hash(new_password)
        user.invite_token = None
        user.invite_token_expires_at = None
        self.repository.db.commit()
        logger.info(f"Contraseña establecida via invitación: {user.username}")
        return True

    def _send_invite_email(self, to_email: str, display_name: str, token: str) -> None:
        """Envía email de invitación con link para establecer contraseña."""
        import os
        frontend_url = os.getenv("PUBLIC_URL", "http://localhost:5173")
        invite_url = f"{frontend_url}/set-password?token={token}"

        try:
            access_token = get_access_token()
        except AuthRequiredError as e:
            logger.error(f"Graph API no autorizada para enviar invitación: {e}")
            raise RuntimeError("El sistema de email no está configurado. Contacta al administrador.")

        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="background: #0c1a3a; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <h1 style="color: white; font-size: 20px; margin: 0;">HR Portal — Bienvenido/a</h1>
            </div>
            <p style="color: #374151; font-size: 15px;">Hola <strong>{display_name}</strong>,</p>
            <p style="color: #374151; font-size: 15px;">
                Se ha creado una cuenta para ti en el Portal de RRHH de Cramer &amp; Asociados.
                Haz clic en el botón para establecer tu contraseña:
            </p>
            <div style="text-align: center; margin: 32px 0;">
                <a href="{invite_url}"
                   style="background: #0c1a3a; color: white; text-decoration: none;
                          padding: 14px 28px; border-radius: 8px; font-size: 15px; font-weight: bold;">
                    Establecer contraseña
                </a>
            </div>
            <p style="color: #6b7280; font-size: 13px;">
                Este enlace expira en <strong>48 horas</strong>.<br>
                Si no esperabas este mensaje, ignóralo.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                Portal RRHH — Cramer &amp; Asociados · Uso interno
            </p>
        </div>
        """

        resp = httpx.post(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "message": {
                    "subject": "[HR Portal] Activa tu cuenta — Establece tu contraseña",
                    "body": {"contentType": "HTML", "content": html_body},
                    "toRecipients": [{"emailAddress": {"address": to_email}}],
                }
            },
            timeout=15,
        )
        if resp.status_code not in (200, 202):
            logger.error(f"Error enviando email de invitación: {resp.status_code} {resp.text}")
            raise RuntimeError("Error al enviar el correo de invitación.")
    
    def update_user(
        self,
        user_id: int,
        email: Optional[str] = None,
        nombre_completo: Optional[str] = None,
        rol_id: Optional[int] = None,
        activo: Optional[bool] = None,
        password: Optional[str] = None,
        modulo_ids: Optional[List[int]] = None
    ) -> Optional[Usuario]:
        """Actualiza un usuario existente."""
        user = self.repository.get_user_by_id(user_id)
        if not user:
            return None
        
        update_data = {}
        if email is not None:
            update_data["email"] = email
        if nombre_completo is not None:
            update_data["nombre_completo"] = nombre_completo
        if rol_id is not None:
            update_data["rol_id"] = rol_id
        if activo is not None:
            update_data["activo"] = activo
        if password is not None:
            update_data["password_hash"] = get_password_hash(password)
        
        updated_user = self.repository.update_user(user, **update_data)
        
        # Actualizar módulos específicos si se proporcionan
        if modulo_ids is not None:
            self.repository.set_user_modules(updated_user, modulo_ids)
        
        logger.info(f"Usuario actualizado: {user.username}")
        
        return updated_user
    
    def get_all_users(self) -> List[Usuario]:
        """Obtiene todos los usuarios."""
        return self.repository.get_all_users()
    
    def get_user_by_id(self, user_id: int) -> Optional[Usuario]:
        """Obtiene un usuario por ID."""
        return self.repository.get_user_by_id(user_id)
    
    def deactivate_user(self, user_id: int) -> Optional[Usuario]:
        """Desactiva un usuario."""
        user = self.repository.get_user_by_id(user_id)
        if user:
            self.repository.deactivate_user(user)
            logger.info(f"Usuario desactivado: {user.username}")
        return user
    
    def get_all_roles(self):
        """Obtiene todos los roles con sus módulos."""
        return self.repository.get_all_roles()

    def create_role(self, nombre: str, descripcion=None, modulo_ids=None):
        """Crea un nuevo rol."""
        return self.repository.create_role(nombre, descripcion, modulo_ids or [])

    def update_role(self, role_id: int, nombre=None, descripcion=None, modulo_ids=None):
        """Actualiza un rol existente."""
        role = self.repository.get_role_by_id(role_id)
        if not role:
            return None
        return self.repository.update_role(role, nombre, descripcion, modulo_ids)
    
    def get_all_modules(self, only_active: bool = True):
        """Obtiene todos los módulos."""
        return self.repository.get_all_modules(only_active)
    
    def toggle_module(self, module_id: int, active: bool):
        """Activa/desactiva un módulo."""
        return self.repository.toggle_module(module_id, active)

    # === Email OTP (verificación antes de setup TOTP) ===

    def send_setup_otp(self, user: Usuario) -> None:
        """Genera OTP de 6 dígitos, lo guarda hasheado en DB y lo envía al email del usuario."""
        # Invalidar OTPs anteriores del usuario
        self.repository.db.query(OTPCode).filter(
            OTPCode.user_id == user.id,
            OTPCode.used == False
        ).update({"used": True})
        self.repository.db.commit()

        code = f"{secrets.randbelow(1_000_000):06d}"
        code_hash = get_password_hash(code)
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        otp = OTPCode(user_id=user.id, code_hash=code_hash, expires_at=expires_at)
        self.repository.db.add(otp)
        self.repository.db.commit()

        self._send_otp_email(user.email, user.nombre_completo or user.username, code)
        logger.info(f"OTP de configuración 2FA enviado a: {user.email}")

    def verify_setup_otp(self, user: Usuario, code: str) -> bool:
        """Verifica OTP de email. Retorna True si válido y no expirado."""
        otp = (
            self.repository.db.query(OTPCode)
            .filter(
                OTPCode.user_id == user.id,
                OTPCode.used == False,
                OTPCode.expires_at > datetime.utcnow()
            )
            .order_by(OTPCode.created_at.desc())
            .first()
        )
        if not otp:
            return False
        if not verify_password(code, otp.code_hash):
            return False
        otp.used = True
        self.repository.db.commit()
        return True

    def _send_otp_email(self, to_email: str, display_name: str, code: str) -> None:
        """Envía email con código OTP vía Microsoft Graph API."""
        try:
            access_token = get_access_token()
        except AuthRequiredError as e:
            logger.error(f"Graph API no autorizada para enviar email: {e}")
            raise RuntimeError("El sistema de email no está configurado. Contacta al administrador.")

        html_body = f"""
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <div style="background: #0c1a3a; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <h1 style="color: white; font-size: 20px; margin: 0;">HR Portal — Verificación de seguridad</h1>
            </div>
            <p style="color: #374151; font-size: 15px;">Hola <strong>{display_name}</strong>,</p>
            <p style="color: #374151; font-size: 15px;">
                Para configurar la verificación en dos pasos en tu cuenta, ingresa el siguiente código:
            </p>
            <div style="background: #f1f5f9; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
                <span style="font-size: 40px; font-weight: bold; letter-spacing: 12px; color: #0c1a3a; font-family: monospace;">{code}</span>
            </div>
            <p style="color: #6b7280; font-size: 13px;">
                Este código expira en <strong>15 minutos</strong> y es de uso único.<br>
                Si no solicitaste este código, ignora este mensaje.
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                Portal RRHH — Cramer &amp; Asociados · Uso interno
            </p>
        </div>
        """

        resp = httpx.post(
            "https://graph.microsoft.com/v1.0/me/sendMail",
            headers={"Authorization": f"Bearer {access_token}"},
            json={
                "message": {
                    "subject": f"[HR Portal] Código de verificación: {code}",
                    "body": {"contentType": "HTML", "content": html_body},
                    "toRecipients": [{"emailAddress": {"address": to_email}}],
                }
            },
            timeout=15,
        )
        if resp.status_code not in (200, 202):
            logger.error(f"Error enviando OTP email: {resp.status_code} {resp.text}")
            raise RuntimeError("Error al enviar el correo de verificación.")

    # === TOTP 2FA ===

    def generate_totp_setup(self, user: Usuario) -> dict:
        """Genera secret TOTP, lo guarda en DB (sin activar), retorna QR."""
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(name=user.username, issuer_name="HR Portal")

        img = qrcode.make(uri)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()

        user.totp_secret = secret
        user.totp_enabled = False
        self.repository.db.commit()
        self.repository.db.refresh(user)

        logger.info(f"TOTP setup iniciado para usuario: {user.username}")
        return {
            "secret": secret,
            "qr_image_b64": f"data:image/png;base64,{b64}",
            "otpauth_uri": uri
        }

    def verify_totp_setup(self, user: Usuario, code: str) -> bool:
        """Verifica código y activa 2FA si correcto."""
        if not user.totp_secret:
            return False
        if verify_totp_code(user.totp_secret, code):
            user.totp_enabled = True
            self.repository.db.commit()
            logger.info(f"2FA activado para usuario: {user.username}")
            return True
        return False

    def verify_totp(self, user: Usuario, code: str) -> bool:
        """Verifica código TOTP durante login."""
        if not user.totp_enabled or not user.totp_secret:
            return False
        return verify_totp_code(user.totp_secret, code)

    def disable_totp(self, user: Usuario, password: str) -> bool:
        """Desactiva 2FA previa verificación de contraseña."""
        if not verify_password(password, user.password_hash):
            return False
        user.totp_secret = None
        user.totp_enabled = False
        self.repository.db.commit()
        logger.info(f"2FA desactivado para usuario: {user.username}")
        return True
