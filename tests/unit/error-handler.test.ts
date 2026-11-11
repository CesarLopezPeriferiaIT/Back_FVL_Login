/**
 * Verify the error handler exposes safe responses for every kind of failure.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { manejadorErrores } from '../../src/http/middlewares/error-handler.js';
import { AppError } from '../../src/shared/errors.js';
import { createLogger } from '../../src/shared/logger.js';

const logger = createLogger('error');

// El motivo se tipa como desconocido a proposito: el manejador de errores debe tratar igual un
// rechazo que no es un objeto Error.
const razonDesconocida: unknown = 'rechazo que no es un objeto Error';

const cuerpoRespuesta = z.object({
  message: z.string(),
  error: z.object({ codigo: z.string(), detalles: z.array(z.string()) }).nullable(),
  code: z.number(),
  data: z.unknown(),
});

const crearAppDePrueba = (): express.Express => {
  const app = express();

  app.get('/app-error', () => {
    throw new AppError('CODIGO_DE_PRUEBA', 'Mensaje de prueba.', 409, ['primer detalle']);
  });

  app.get('/validacion', () => {
    z.object({ campo: z.string() }).parse({});
    return undefined;
  });

  app.get('/inesperado', () => {
    throw new Error('detalle interno que no debe exponerse');
  });

  app.get('/no-error', (): never => {
    throw razonDesconocida;
  });

  app.get('/respondido', (_req, res) => {
    res.status(200).json({ ok: true });
    throw new Error('fallo posterior a la respuesta');
  });

  app.use(manejadorErrores(logger));
  return app;
};

describe('manejador de errores', () => {
  it('presenta un error de aplicacion con su codigo, estado y detalles', async () => {
    const respuesta = await request(crearAppDePrueba()).get('/app-error').expect(409);
    const cuerpo = cuerpoRespuesta.parse(respuesta.body as unknown);

    expect(cuerpo.message).toBe('Mensaje de prueba.');
    expect(cuerpo.error?.codigo).toBe('CODIGO_DE_PRUEBA');
    expect(cuerpo.error?.detalles).toEqual(['primer detalle']);
    expect(cuerpo.code).toBe(409);
    expect(cuerpo.data).toBeNull();
  });

  it('presenta un error de validacion con un detalle por cada incidencia', async () => {
    const respuesta = await request(crearAppDePrueba()).get('/validacion').expect(400);
    const cuerpo = cuerpoRespuesta.parse(respuesta.body as unknown);

    expect(cuerpo.error?.codigo).toBe('VALIDACION_FALLIDA');
    expect(cuerpo.error?.detalles.length).toBeGreaterThan(0);
    expect(cuerpo.error?.detalles.join(' ')).toContain('campo');
  });

  it('oculta el detalle de un error inesperado', async () => {
    const respuesta = await request(crearAppDePrueba()).get('/inesperado').expect(500);
    const cuerpo = cuerpoRespuesta.parse(respuesta.body as unknown);

    expect(cuerpo.error?.codigo).toBe('ERROR_INTERNO');
    expect(cuerpo.message).not.toContain('detalle interno');
    expect(JSON.stringify(cuerpo)).not.toContain('detalle interno');
  });

  it('trata igual un rechazo que no es un objeto Error', async () => {
    const respuesta = await request(crearAppDePrueba()).get('/no-error').expect(500);
    const cuerpo = cuerpoRespuesta.parse(respuesta.body as unknown);

    expect(cuerpo.error?.codigo).toBe('ERROR_INTERNO');
    expect(cuerpo.message).not.toContain('rechazo que no es');
  });

  it('delega en el manejador por defecto cuando la respuesta ya se envio', async () => {
    const respuesta = await request(crearAppDePrueba()).get('/respondido').expect(200);
    const cuerpo = z.object({ ok: z.boolean() }).parse(respuesta.body as unknown);

    expect(cuerpo.ok).toBe(true);
  });
});
