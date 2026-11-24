/**
 * Adapt the geographic catalog repository to HTTP requests and responses.
 *
 * @author Jose Calpa <jose20calpa93@gmail.com>
 * @version 1.0.0
 */
import type { RequestHandler } from 'express';
import type { CatalogoRepository } from '../../domain/ports.js';
import { responderOk } from '../http-response.js';
import { municipiosQuerySchema } from '../validators/catalogo.validators.js';

export const crearCatalogoController = (
  catalogos: CatalogoRepository,
): Record<string, RequestHandler> => ({
  roles: async (_req, res) =>
    responderOk(res, 'Roles consultados.', {
      roles: (await catalogos.listarRoles()).map(({ codigo, nombre, areaServicio }) => ({
        codigo,
        nombre,
        area_servicio: areaServicio,
      })),
    }),
  departamentos: async (_req, res) =>
    responderOk(res, 'Departamentos consultados.', {
      departamentos: await catalogos.listarDepartamentos(),
    }),
  municipios: async (req, res) => {
    const { department } = municipiosQuerySchema.parse(req.query);
    const municipios = await catalogos.listarMunicipios(department);
    responderOk(res, 'Municipios consultados.', {
      municipios: municipios.map(({ codigo, nombre, codigoDepartamento }) => ({
        codigo,
        nombre,
        codigo_departamento: codigoDepartamento,
      })),
    });
  },
});
