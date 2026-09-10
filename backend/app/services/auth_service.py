"""
Servicio de autenticación y gestión de usuarios.
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import hashlib
import secrets

from app.repositories.auth_repository import AuthRepository
from app.models.auth import Usuario, Modulo
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.logging_config import logger
from app.core.config import settings
from app.services.email_token_service import AuthRequiredError

# Vigencia del enlace de invitación. Una sola fuente: el token y el texto del
# correo tienen que decir lo mismo.
INVITE_TTL_HORAS = 48


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
        Retorna módulos activos del rol del usuario + módulos directos asignados al usuario.
        Los módulos directos (usuario_modulos) permiten excepciones fuera del rol.
        """
        seen_ids: set[int] = set()
        result: List[Modulo] = []

        for m in (user.rol.modulos if user.rol else []):
            if m.activo and m.id not in seen_ids:
                seen_ids.add(m.id)
                result.append(m)

        for m in user.modulos:
            if m.activo and m.id not in seen_ids:
                seen_ids.add(m.id)
                result.append(m)

        return result
    
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

        # El usuario ya está commiteado: si el correo falla no lo borramos,
        # marcamos la falla para que el admin pueda reenviar la invitación.
        user.invite_email_failed = False
        if send_invite:
            try:
                self._generate_and_send_invite(user)
            except RuntimeError as e:
                user.invite_email_failed = True
                logger.error(f"Usuario {username} creado pero falló el envío de invitación: {e}")

        logger.info(f"Usuario creado: {username}")
        return user

    @staticmethod
    def _hash_invite_token(token: str) -> str:
        """SHA-256 del token. En DB solo vive el hash: un dump no entrega enlaces vivos.

        No lleva salt a propósito — el token ya son 32 bytes aleatorios, así que
        la búsqueda por igualdad sigue siendo un índice y no un escaneo.
        """
        return hashlib.sha256(token.encode()).hexdigest()

    def _generate_and_send_invite(self, user: Usuario) -> None:
        """Genera token de invitación, guarda su hash en DB y envía el token al usuario."""
        token = secrets.token_urlsafe(32)
        user.invite_token = self._hash_invite_token(token)
        user.invite_token_expires_at = datetime.utcnow() + timedelta(hours=INVITE_TTL_HORAS)
        self.repository.db.commit()
        self._send_invite_email(user.email, user.nombre_completo or user.username, token)

    def resend_invite(self, user_id: int) -> bool:
        """Regenera y reenvía invitación a un usuario existente. Retorna False si no existe."""
        user = self.repository.get_user_by_id(user_id)
        if not user or not user.email:
            return False
        self._generate_and_send_invite(user)  # RuntimeError si el correo no sale
        return True

    def set_password_from_invite(self, token: str, new_password: str) -> bool:
        """Valida token de invitación y establece la contraseña. Retorna False si token inválido/expirado."""
        user = (
            self.repository.db.query(Usuario)
            .filter(
                Usuario.invite_token == self._hash_invite_token(token),
                Usuario.invite_token_expires_at > datetime.utcnow(),
                # Una cuenta desactivada no se reactiva canjeando una invitación vieja.
                Usuario.activo == True,
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
        """Envía el correo de invitación con el enlace para establecer contraseña.

        La plantilla vive en email_templates.invite_email y el envío en
        send_email_graph: acá solo se arma la URL y se traduce la falla al
        RuntimeError que create_user y resend_invite esperan.
        """
        from app.schemas.auth import PASSWORD_MIN_LENGTH
        from app.services.email_service import send_email_graph
        from app.services.email_templates import invite_email

        invite_url = f"{settings.PUBLIC_URL or 'http://localhost:5173'}/set-password?token={token}"
        html_body = invite_email(display_name, invite_url, PASSWORD_MIN_LENGTH,
                                 expira_horas=INVITE_TTL_HORAS)

        try:
            enviado = send_email_graph(
                to=to_email, cc="", subject="Activa tu cuenta - Plataforma de Personas",
                html_body=html_body,
            )
        except AuthRequiredError as e:
            logger.error(f"Graph API no autorizada para enviar invitación: {e}")
            raise RuntimeError("El sistema de email no está configurado. Contacta al administrador.")

        if not enviado:
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
