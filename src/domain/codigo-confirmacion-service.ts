/**
 * Confirmation code domain service.
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
import type { CodigoConfirmacionRepository, UsuarioRepository } from './ports.js';

export interface CodigoConfirmacionService {
  generar(email: string): Promise<{ codigo: string; expiraEn: Date; uuidCodigo: string }>;
  validar(email: string, codigo: string): Promise<{ usuario: Usuario; uuidCodigo: string }>;
  marcarUsado(uuidCodigo: string): Promise<void>;
}

export const createCodigoConfirmacionService = (deps: {
  codigos: CodigoConfirmacionRepository;
  usuarios: UsuarioRepository;
  hasher: PasswordHasher;
  config: AppConfig;
  logger: Logger;
}): CodigoConfirmacionService => {
  const buscarUsuario = async (email: string): Promise<Usuario> => {
    const usuario = await deps.usuarios.findByEmail(normalizarEmail(email));
    if (!usuario)
      throw new AppError('USUARIO_NO_ENCONTRADO', 'No existe una cuenta asociada al correo.', 404);
    return usuario;
  };
  return {
    generar: async (email) => {
      const usuario = await buscarUsuario(email);
      const anterior = await deps.codigos.buscarNoConsumidoPorUsuario(usuario.uuid);
      if (anterior) await deps.codigos.invalidar(anterior.uuid);
      const codigo = String(randomInt(0, 1000000)).padStart(6, '0');
      const uuidCodigo = randomUUID();
      const expiraEn = new Date(Date.now() + deps.config.confirmacion.ttlHours * 60 * 60 * 1000);
      await deps.codigos.guardar({
        uuid: uuidCodigo,
        uuidUsuario: usuario.uuid,
        codigoHash: await deps.hasher.hash(codigo),
        expiraEn,
        intentos: 0,
        invalidado: false,
        usadoEn: null,
      });
      return { codigo, expiraEn, uuidCodigo };
    },
    validar: async (email, codigo) => {
      const usuario = await buscarUsuario(email);
      if (usuario.estado !== 'C')
        throw new AppError('CUENTA_YA_CONFIRMADA', 'La cuenta ya fue confirmada.', 409);
      const registro = await deps.codigos.buscarNoConsumidoPorUsuario(usuario.uuid);
      if (!registro) {
        const ultimo = await deps.codigos.buscarUltimoPorUsuario(usuario.uuid);
        if (ultimo?.invalidado)
          throw new AppError(
            'CODIGO_CONFIRMACION_INVALIDADO',
            'El codigo de confirmacion se invalido por demasiados intentos fallidos.',
            429,
          );
        if (ultimo && ultimo.expiraEn.getTime() <= Date.now())
          throw new AppError(
            'CODIGO_CONFIRMACION_VENCIDO',
            'El codigo de confirmacion vencio. Solicite un nuevo codigo.',
            400,
          );
        throw new AppError(
          'CODIGO_CONFIRMACION_NO_EXISTE',
          'No hay un codigo de confirmacion vigente para esta cuenta.',
          404,
        );
      }
      if (registro.expiraEn.getTime() <= Date.now())
        throw new AppError(
          'CODIGO_CONFIRMACION_VENCIDO',
          'El codigo de confirmacion vencio. Solicite un nuevo codigo.',
          400,
        );
      if (!(await deps.hasher.verify(registro.codigoHash, codigo))) {
        const resultado = await deps.codigos.registrarIntentoFallido(
          registro.uuid,
          deps.config.confirmacion.maxIntentos,
        );
        if (
          !resultado ||
          resultado.invalidado ||
          resultado.intentos >= deps.config.confirmacion.maxIntentos
        ) {
          throw new AppError(
            'CODIGO_CONFIRMACION_INVALIDADO',
            'El codigo de confirmacion se invalido por demasiados intentos fallidos.',
            429,
          );
        }
        throw new AppError(
          'CODIGO_CONFIRMACION_INVALIDO',
          'El codigo de confirmacion no coincide.',
          400,
        );
      }
      return { usuario, uuidCodigo: registro.uuid };
    },
    marcarUsado: (uuidCodigo) => deps.codigos.marcarUsado(uuidCodigo),
  };
};
