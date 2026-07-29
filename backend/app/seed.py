from passlib.context import CryptContext                                                                                                                                                               from app.db.session import SessionLocal                                                                                                                                                              
from app.models.auth import Role, Usuario, Modulo                                                                                                                                                                                                                                                                                                                                                      
  pwd_ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')                                                                                                                                        
  db = SessionLocal()

  admin_role = Role(nombre='admin', descripcion='Administrador del sistema')
  rrhh_role = Role(nombre='rrhh', descripcion='Recursos Humanos')
  user_role = Role(nombre='usuario', descripcion='Usuario estándar')
  db.add_all([admin_role, rrhh_role, user_role])
  db.flush()

  modulos = [
      Modulo(codigo='dashboard', nombre='Torniquetes', orden=1, activo=True),
      Modulo(codigo='finiquitos', nombre='Finiquitos', orden=2, activo=True),
      Modulo(codigo='admin', nombre='Administración', orden=3, activo=True),
  ]
  db.add_all(modulos)
  db.flush()

  admin = Usuario(
      username='admin',
      password_hash=pwd_ctx.hash('admin123'),
      nombre_completo='Administrador',
      rol_id=admin_role.id,
      activo=True
  )
  db.add(admin)
  db.commit()
  print('Usuario admin creado correctamente')
  db.close()
