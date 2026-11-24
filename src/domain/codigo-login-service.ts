/**
 * Login code domain service.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { randomInt, randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/env.js';
import { normalizarEmail } from '../shared/email.js';
import { AppError } from '../shared/errors.js';
import type { Logger } from '../shared/logger.js';
import type { Usuario } from './entities.js';
import type { PasswordHasher } from './password-hasher.js';
import type { CodigoLoginRepository, UsuarioRepository } from './ports.js';

export interface CodigoLoginService {
  generar(email: string): Promise<{ codigo: string; expiraEn: Date }>;
  validar(email: string, codigo: string): Promise<{ usuario: Usuario; uuidCodigo: string }>;
  marcarUsado(uuidCodigo: string): Promise<boolean>;
  clasificarFallo(email: string): Promise<AppError>;
}

export const createCodigoLoginService = (deps: {
  codigos: CodigoLoginRepository;
  usuarios: UsuarioRepository;
  hasher: PasswordHasher;
  config: AppConfig;
  logger: Logger;
}): CodigoLoginService => {
  const noExiste = (): AppError =>
    new AppError(
      'CODIGO_ACCESO_NO_EXISTE',
      'No hay un codigo de acceso vigente para esta cuenta.',
      401,
    );
  const vencido = (): AppError =>
    new AppError(
      'CODIGO_ACCESO_VENCIDO',
      'El codigo de acceso vencio. Solicite un nuevo codigo.',
      401,
    );
  const invalidado = (): AppError =>
    new AppError(
      'CODIGO_ACCESO_INVALIDADO',
      'El codigo de acceso se invalido por demasiados intentos fallidos.',
      401,
    );
  const invalido = (): AppError =>
    new AppError('CODIGO_ACCESO_INVALIDO', 'El codigo de acceso no coincide.', 401);
  const estado = (usuario: Usuario): AppError | null => {
    if (usuario.estado === 'C')
      return new AppError(
        'CUENTA_POR_CONFIRMAR',
        'La cuenta aun no ha sido confirmada con el correo electronico.',
        403,
      );
    if (usuario.estado === 'I')
      return new AppError('CUENTA_INACTIVA', 'La cuenta se encuentra inactiva.', 403);
    if (usuario.estado === 'D')
      return new AppError(
        'CUENTA_DESACTIVADA',
        'La cuenta fue desactivada por intentos fallidos de inicio de sesion.',
        403,
      );
    return null;
  };
  const buscar = (email: string): Promise<Usuario | null> =>
    deps.usuarios.findByEmail(normalizarEmail(email));
  const servicio: CodigoLoginService = {
    clasificarFallo: async (email) => {
      const usuario = await buscar(email);
      if (!usuario) return noExiste();
      const error = estado(usuario);
      if (error) return error;
      const ultimo = await deps.codigos.buscarUltimoPorUsuario(usuario.uuid);
      if (!ultimo || ultimo.usadoEn !== null) return noExiste();
      if (ultimo.invalidado) return invalidado();
      if (ultimo.expiraEn.getTime() <= Date.now()) return vencido();
      return invalido();
    },
    generar: async (email) => {
      const usuario = await buscar(email);
      if (!usuario) throw new AppError('USUARIO_NO_ENCONTRADO', 'La cuenta no existe.', 404);
      const error = estado(usuario);
      if (error) throw error;
      const anterior = await deps.codigos.buscarNoConsumidoPorUsuario(usuario.uuid);
      if (anterior) await deps.codigos.invalidar(anterior.uuid);
      const codigo = String(randomInt(0, 1000000)).padStart(6, '0');
      const expiraEn = new Date(Date.now() + deps.config.loginCode.ttlMinutes * 60000);
      await deps.codigos.guardar({
        uuid: randomUUID(),
        uuidUsuario: usuario.uuid,
        codigoHash: await deps.hasher.hash(codigo),
        expiraEn,
        intentos: 0,
        invalidado: false,
        usadoEn: null,
      });
      return { codigo, expiraEn };
    },
    validar: async (email, codigo) => {
      const usuario = await buscar(email);
      if (!usuario) throw noExiste();
      const error = estado(usuario);
      if (error) throw error;
      const registro = await deps.codigos.buscarNoConsumidoPorUsuario(usuario.uuid);
      if (!registro) throw await servicio.clasificarFallo(email);
      if (registro.expiraEn.getTime() <= Date.now()) throw vencido();
      if (!(await deps.hasher.verify(registro.codigoHash, codigo))) {
        const resultado = await deps.codigos.registrarIntentoFallido(
          registro.uuid,
          deps.config.loginCode.maxAttempts,
        );
        if (!resultado) throw await servicio.clasificarFallo(email);
        throw resultado.invalidado ? invalidado() : invalido();
      }
      return { usuario, uuidCodigo: registro.uuid };
    },
    marcarUsado: (uuidCodigo) => deps.codigos.marcarUsado(uuidCodigo),
  };
  return servicio;
};
