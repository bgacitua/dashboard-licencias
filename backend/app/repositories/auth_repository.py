"""
Repositorio para operaciones de base de datos relacionadas con autenticación.
"""
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from datetime import datetime

from app.models.auth import Usuario, Role, Modulo


class AuthRepository:
    """Repositorio para operaciones con usuarios, roles y módulos."""
    
    def __init__(self, db: Session):
        self.db = db
    
    # === Operaciones de Usuario ===
    
    def get_user_by_username(self, username: str) -> Optional[Usuario]:
        """Obtiene un usuario por su username, incluyendo rol y módulos."""
        return (
            self.db.query(Usuario)
            .options(
                joinedload(Usuario.rol).joinedload(Role.modulos)
            )
            .filter(Usuario.username == username)
            .first()
        )
    
    def get_user_by_id(self, user_id: int) -> Optional[Usuario]:
        """Obtiene un usuario por su ID."""
        return (
            self.db.query(Usuario)
            .options(
                joinedload(Usuario.rol).joinedload(Role.modulos)
            )
            .filter(Usuario.id == user_id)
            .first()
        )
    
    def get_all_users(self) -> List[Usuario]:
        """Obtiene todos los usuarios."""
        return (
            self.db.query(Usuario)
            .options(joinedload(Usuario.rol))
            .order_by(Usuario.username)
            .all()
        )
    
    def create_user( self, username: str, password_hash: str, rol_id: int, 
        email: Optional[str] = None, nombre_completo: Optional[str] = None ) -> Usuario:
        """Crea un nuevo usuario."""
        user = Usuario(
            username=username,
            password_hash=password_hash,
            rol_id=rol_id,
            email=email,
            nombre_completo=nombre_completo
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def update_user(self, user: Usuario, **kwargs) -> Usuario:
        """Actualiza un usuario con los campos proporcionados."""
        for key, value in kwargs.items():
            if hasattr(user, key) and value is not None:
                setattr(user, key, value)
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def update_last_login(self, user: Usuario) -> None:
        """Actualiza la fecha de último login."""
        user.last_login = datetime.utcnow()
        self.db.commit()
    
    def deactivate_user(self, user: Usuario) -> Usuario:
        """Desactiva un usuario (soft delete)."""
        user.activo = False
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def set_user_modules(self, user: Usuario, modulo_ids: List[int]) -> None:
        """Asigna módulos específicos a un usuario."""
        modules = self.db.query(Modulo).filter(Modulo.id.in_(modulo_ids)).all()
        user.modulos = modules
        self.db.commit()
        self.db.refresh(user)
    
    # === Operaciones de Rol ===
    
    def get_all_roles(self) -> List[Role]:
        """Obtiene todos los roles."""
        return self.db.query(Role).order_by(Role.id).all()
    
    def get_role_by_id(self, role_id: int) -> Optional[Role]:
        """Obtiene un rol por su ID."""
        return (
            self.db.query(Role)
            .options(joinedload(Role.modulos))
            .filter(Role.id == role_id)
            .first()
        )
    
    def get_role_by_name(self, name: str) -> Optional[Role]:
        """Obtiene un rol por su nombre."""
        return self.db.query(Role).filter(Role.nombre == name).first()
    
    # === Operaciones de Módulo ===
    
    def get_all_modules(self, only_active: bool = True) -> List[Modulo]:
        """Obtiene todos los módulos."""
        query = self.db.query(Modulo).order_by(Modulo.orden)
        if only_active:
            query = query.filter(Modulo.activo == True)
        return query.all()
    
    def get_module_by_code(self, code: str) -> Optional[Modulo]:
        """Obtiene un módulo por su código."""
        return self.db.query(Modulo).filter(Modulo.codigo == code).first()
    
    def get_modules_for_role(self, role_id: int) -> List[Modulo]:
        """Obtiene los módulos permitidos para un rol."""
        role = self.get_role_by_id(role_id)
        if role:
            return [m for m in role.modulos if m.activo]
        return []
    
    def toggle_module(self, module_id: int, active: bool) -> Optional[Modulo]:
        """Activa o desactiva un módulo."""
        module = self.db.query(Modulo).filter(Modulo.id == module_id).first()
        if module:
            module.activo = active
            self.db.commit()
            self.db.refresh(module)
        return module
