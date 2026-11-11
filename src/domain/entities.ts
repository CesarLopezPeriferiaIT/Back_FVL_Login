/**
 * Tipos de dominio compartidos por la capa de aplicacion y la capa de infraestructura.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */

/** Estados posibles de una cuenta de usuario. */
export type EstadoUsuario = 'A' | 'I' | 'C' | 'D';

/** Tipo de cliente que consume la API y por tanto el perfil de permisos que recibe. */
export type TipoCliente = 'mobile' | 'web-bff' | 'web';

/** Alcances de autorizacion que puede tener una API Key. */
export const PERMISOS = {
  authRegister: 'auth:register',
  authLogin: 'auth:login',
  authConfirmEmail: 'auth:confirm-email',
  authRefresh: 'auth:refresh',
  authLogout: 'auth:logout',
  authPasswordReset: 'auth:password-reset',
  authMe: 'auth:me',
} as const;

/** Union de los alcances de autorizacion existentes. */
export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

/** Cuenta de usuario persistida. */
export interface Usuario {
  uuid: string;
  email: string;
  passHash: string;
  estado: EstadoUsuario;
  fechaCreacion: Date;
  fechaModificacion: Date;
  tyc: boolean;
}

/** Datos minimos necesarios para persistir una cuenta nueva. */
export interface NuevoUsuario {
  uuid: string;
  email: string;
  passHash: string;
  estado: EstadoUsuario;
  tyc: boolean;
}

/**
 * Intento de inicio de sesion. Cuando el intento es exitoso la fila tambien representa la
 * sesion abierta y por lo tanto almacena el refresh token hasheado.
 */
export interface LogSession {
  uuid: string;
  uuidUsuario: string;
  successful: boolean;
  timestampIntento: Date;
  refreshTokenHash: string | null;
  refreshExpiresAt: Date | null;
  revokedAt: Date | null;
  rotadoEn: Date | null;
}

/** Credencial de cliente registrada contra la API. Solo se persiste el hash de la clave. */
export interface ApiKey {
  uuid: string;
  keyHash: string;
  nombre: string;
  tipoCliente: TipoCliente;
  permisos: Permiso[];
  revocado: boolean;
  fechaCreacion: Date;
  fechaModificacion: Date;
  ultimoUso: Date | null;
}

/** Vista publica de una cuenta, sin datos sensibles, para las respuestas de la API. */
export interface UsuarioPublico {
  uuid: string;
  email: string;
  estado: EstadoUsuario;
  tyc: boolean;
  fechaCreacion: Date;
  fechaModificacion: Date;
}

/** Proyecta una cuenta de usuario a la vista publica expuesta por la API. */
export const toUsuarioPublico = (usuario: Usuario): UsuarioPublico => ({
  uuid: usuario.uuid,
  email: usuario.email,
  estado: usuario.estado,
  tyc: usuario.tyc,
  fechaCreacion: usuario.fechaCreacion,
  fechaModificacion: usuario.fechaModificacion,
});
