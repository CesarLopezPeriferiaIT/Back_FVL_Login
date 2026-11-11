/**
 * Adapt authentication service operations to HTTP requests and responses.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { Request, RequestHandler } from 'express';
import type { AuthService, ResultadoSesion } from '../../domain/auth-service.js';
import { AppError } from '../../shared/errors.js';
import { responderOk } from '../http-response.js';
import {
  cambioSchema,
  emailSchema,
  loginSchema,
  refreshSchema,
  registroSchema,
  resetSchema,
  tokenSchema,
} from '../validators/auth.validators.js';

const sesion = (req: Request): NonNullable<Request['sesion']> => {
  if (!req.sesion) throw new AppError('TOKEN_REQUERIDO', 'Se requiere un token de acceso.', 401);
  return req.sesion;
};
const tokenEntrada = (req: Request): unknown => {
  const body: unknown = req.body;
  const tokenBody =
    typeof body === 'object' && body !== null && 'token' in body ? body.token : undefined;
  return { token: tokenBody ?? req.query['token'] };
};
const datosSesion = (resultado: ResultadoSesion): object => ({
  token_acceso: resultado.tokenAcceso,
  token_refresh: resultado.tokenRefresh,
  token_type: 'Bearer',
  expires_in: resultado.expiresIn,
  refresh_expires_at: resultado.refreshExpiresAt,
  usuario: resultado.usuario,
});

export const crearAuthController = (service: AuthService): Record<string, RequestHandler> => ({
  registro: async (req, res) => {
    const body: unknown = req.body;
    const resultado = await service.registrar(registroSchema.parse(body));
    responderOk(
      res,
      'Registro realizado.',
      {
        usuario: resultado.usuario,
        correo_confirmacion_enviado: resultado.correoConfirmacionEnviado,
      },
      201,
    );
  },
  login: async (req, res) => {
    const body: unknown = req.body;
    responderOk(
      res,
      'Sesion iniciada.',
      datosSesion(await service.iniciarSesion(loginSchema.parse(body))),
    );
  },
  confirmar: async (req, res) => {
    const { token } = tokenSchema.parse(tokenEntrada(req));
    responderOk(res, 'Correo confirmado.', { usuario: await service.confirmarCorreo(token) });
  },
  refresh: async (req, res) => {
    const body: unknown = req.body;
    const { refresh_token } = refreshSchema.parse(body);
    responderOk(res, 'Sesion renovada.', datosSesion(await service.renovarSesion(refresh_token)));
  },
  logout: async (req, res) => {
    await service.cerrarSesion(sesion(req).sessionId);
    res.setHeader('Clear-Site-Data', '"cache","cookies","storage"');
    responderOk(res, 'Sesion cerrada.', { mensaje: 'Sesion cerrada' });
  },
  forgot: async (req, res) => {
    const body: unknown = req.body;
    const { email } = emailSchema.parse(body);
    await service.solicitarReseteo(email);
    responderOk(res, 'Si la cuenta existe, recibira instrucciones.', null);
  },
  verificarReset: async (req, res) => {
    const { token } = tokenSchema.parse(tokenEntrada(req));
    responderOk(res, 'Enlace valido.', await service.verificarEnlaceReseteo(token));
  },
  reset: async (req, res) => {
    const body: unknown = req.body;
    const { token, nueva_password } = resetSchema.parse(body);
    await service.resetearContrasena({ token, nuevaPassword: nueva_password });
    responderOk(res, 'Contrasena actualizada.', null);
  },
  cambiar: async (req, res) => {
    const body: unknown = req.body;
    const { password_actual, nueva_password } = cambioSchema.parse(body);
    const actual = sesion(req);
    await service.cambiarContrasena({
      uuidUsuario: actual.uuidUsuario,
      sessionId: actual.sessionId,
      passwordActual: password_actual,
      nuevaPassword: nueva_password,
    });
    responderOk(res, 'Contrasena actualizada.', null);
  },
  perfil: async (req, res) =>
    responderOk(res, 'Perfil consultado.', {
      usuario: await service.consultarPerfil(sesion(req).uuidUsuario),
    }),
});
