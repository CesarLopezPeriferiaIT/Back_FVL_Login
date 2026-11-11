/**
 * Contratos que la capa de aplicacion exige a la infraestructura.
 *
 * Los repositorios se declaran como interfaces para que el dominio no dependa de SQL Server y
 * pueda probarse con dobles en memoria.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type {
  ApiKey,
  EstadoUsuario,
  LogSession,
  Permiso,
  TipoCliente,
  Usuario,
} from './entities.js';

/** Acceso a las cuentas de usuario. */
export interface UsuarioRepository {
  findByEmail(email: string): Promise<Usuario | null>;
  findByUuid(uuid: string): Promise<Usuario | null>;
  create(nuevoUsuario: NuevoUsuario): Promise<Usuario>;
  updateEstado(uuid: string, estado: EstadoUsuario): Promise<void>;
  updatePassword(uuid: string, passHash: string): Promise<void>;
}

/** Datos minimos para persistir una cuenta nueva. */
export interface NuevoUsuario {
  uuid: string;
  email: string;
  passHash: string;
  estado: EstadoUsuario;
  tyc: boolean;
}

/** Acceso a los intentos de inicio de sesion y a las sesiones vivas. */
export interface LogSessionRepository {
  registrarIntentoFallido(uuidUsuario: string): Promise<void>;
  registrarSesion(
    uuidUsuario: string,
    refreshTokenHash: string,
    refreshExpiresAt: Date,
  ): Promise<LogSession>;
  rotarRefresh(uuid: string, refreshTokenHash: string, refreshExpiresAt: Date): Promise<void>;
  revocarSesion(uuid: string): Promise<void>;
  revocarSesionesDeUsuario(uuidUsuario: string, exceptoSessionUuid?: string): Promise<void>;
  contarIntentosFallidosDesdeUltimoExito(uuidUsuario: string): Promise<number>;
  buscarSesionPorHash(refreshTokenHash: string): Promise<LogSession | null>;
}

/** Datos minimos para registrar una credencial de cliente. */
export interface NuevaApiKey {
  uuid: string;
  keyHash: string;
  nombre: string;
  tipoCliente: TipoCliente;
  permisos: Permiso[];
}

/** Acceso a las credenciales de cliente. */
export interface ApiKeyRepository {
  findByHash(keyHash: string): Promise<ApiKey | null>;
  create(nuevaApiKey: NuevaApiKey): Promise<ApiKey>;
  registrarUso(uuid: string): Promise<void>;
}

/** Mensaje de correo saliente. */
export interface MensajeCorreo {
  destinatario: string;
  asunto: string;
  texto: string;
  html: string;
}

/** Servicio de envio de correo. */
export interface MailSender {
  enviar(mensaje: MensajeCorreo): Promise<void>;
}
