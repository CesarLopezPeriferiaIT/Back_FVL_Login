/**
 * Register client installations and disclose their keys once.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { RequestHandler } from 'express';
import type { ApiKeyService } from '../../domain/api-key-service.js';
import { responderOk } from '../http-response.js';
import { instalacionSchema } from '../validators/installation.validators.js';

export const registrarInstalacion =
  (service: ApiKeyService): RequestHandler =>
  async (req, res) => {
    const body: unknown = req.body;
    const entrada = instalacionSchema.parse(body);
    const { apiKey, clave } = await service.registrarInstalacion({
      nombre: entrada.nombre,
      tipoCliente: entrada.tipo_cliente,
    });
    responderOk(
      res,
      'Instalacion registrada.',
      {
        api_key: clave,
        tipo_cliente: apiKey.tipoCliente,
        permisos: apiKey.permisos,
        fecha_creacion: apiKey.fechaCreacion,
      },
      201,
    );
  };
