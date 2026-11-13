/**
 * Adapt the pin access operations to HTTP requests and responses.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { Request, RequestHandler } from 'express';
import type { PinService } from '../../domain/pin-service.js';
import { AppError } from '../../shared/errors.js';
import { responderOk } from '../http-response.js';
import { pinConfiguracionSchema, pinVerificacionSchema } from '../validators/pin.validators.js';

const sesion = (req: Request): NonNullable<Request['sesion']> => {
  if (!req.sesion) {
    throw new AppError('TOKEN_REQUERIDO', 'Se requiere un token de acceso.', 401);
  }
  return req.sesion;
};

export const crearPinController = (service: PinService): Record<string, RequestHandler> => ({
  configurar: async (req, res) => {
    const body: unknown = req.body;
    const { pin, dispositivo } = pinConfiguracionSchema.parse(body);

    await service.configurar({
      uuidUsuario: sesion(req).uuidUsuario,
      pin,
      dispositivo,
    });

    responderOk(res, 'Pin de acceso configurado.', { pin_configurado: true }, 201);
  },

  verificar: async (req, res) => {
    const body: unknown = req.body;
    const { pin } = pinVerificacionSchema.parse(body);

    await service.verificar({ uuidUsuario: sesion(req).uuidUsuario, pin });

    responderOk(res, 'Pin verificado.', { verificado: true });
  },

  revocar: async (req, res) => {
    await service.revocar({ uuidUsuario: sesion(req).uuidUsuario });

    responderOk(res, 'Pin de acceso revocado.', { pin_revocado: true });
  },
});
