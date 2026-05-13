"""
Servicio de autenticación y gestión de usuarios.
"""
from typing import Optional, List
from sqlalchemy.orm import Session
import pyotp
import qrcode
import io
import base64

from app.repositories.auth_repository import AuthRepository
from app.models.auth import Usuario, Modulo
from app.core.security import verify_password, get_password_hash, create_access_token, verify_totp_code
from app.core.logging_config import logger


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
        password: str,
        rol_id: int,
        email: Optional[str] = None,
        nombre_completo: Optional[str] = None,
        modulo_ids: Optional[List[int]] = None
    ) -> Usuario:
        """Crea un nuevo usuario con password hasheado."""
        password_hash = get_password_hash(password)
        
        user = self.repository.create_user(
            username=username,
            password_hash=password_hash,
            rol_id=rol_id,
            email=email,
            nombre_completo=nombre_completo
        )
        
        # Asignar módulos específicos si se proporcionan
        if modulo_ids:
            self.repository.set_user_modules(user, modulo_ids)
        
        logger.info(f"Usuario creado: {username}")
        return user
    
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
