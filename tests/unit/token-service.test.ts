/**
 * Pruebas de emision y verificacion de tokens firmados.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import { describe, expect, it } from 'vitest';
import { createTokenService } from '../../src/domain/token-service.js';
import { configDePrueba } from '../helpers/config.js';

const config = configDePrueba();
const tokens = createTokenService(config);

describe('servicio de tokens', () => {
  it('emite un token de acceso con los claims de la sesion', () => {
    const token = tokens.crearTokenAcceso({
      uuidUsuario: 'uuid-usuario',
      email: 'usuario@ejemplo.co',
      sessionId: 'uuid-sesion',
    });

    expect(tokens.verificarTokenAcceso(token)).toEqual({
      sub: 'uuid-usuario',
      email: 'usuario@ejemplo.co',
      sid: 'uuid-sesion',
    });
  });

  it('emite un token de confirmacion con el correo', () => {
    const token = tokens.crearTokenConfirmacion('usuario@ejemplo.co');
    expect(tokens.verificarTokenConfirmacion(token)).toEqual({
      email: 'usuario@ejemplo.co',
    });
  });

  it('emite un token de reseteo con el correo y la huella de la contrasena', () => {
    const token = tokens.crearTokenReseteo('usuario@ejemplo.co', 'huella-1234');
    expect(tokens.verificarTokenReseteo(token)).toEqual({
      email: 'usuario@ejemplo.co',
      pwd: 'huella-1234',
    });
  });

  it('rechaza un token firmado con otro secreto', () => {
    const otroServicio = createTokenService({
      ...config,
      jwt: { ...config.jwt, accessSecret: 'otro-secreto-distinto-de-prueba-32-caracteres' },
    });
    const token = otroServicio.crearTokenAcceso({
      uuidUsuario: 'uuid-usuario',
      email: 'usuario@ejemplo.co',
      sessionId: 'uuid-sesion',
    });

    expect(() => tokens.verificarTokenAcceso(token)).toThrow();
  });

  it('no permite usar un token de confirmacion como token de acceso', () => {
    const token = tokens.crearTokenConfirmacion('usuario@ejemplo.co');
    expect(() => tokens.verificarTokenAcceso(token)).toThrow();
  });

  it('no permite usar un token de reseteo como token de confirmacion', () => {
    const token = tokens.crearTokenReseteo('usuario@ejemplo.co', 'huella-1234');
    expect(() => tokens.verificarTokenConfirmacion(token)).toThrow();
  });

  it('no permite usar un token de acceso como token de reseteo', () => {
    const token = tokens.crearTokenAcceso({
      uuidUsuario: 'uuid-usuario',
      email: 'usuario@ejemplo.co',
      sessionId: 'uuid-sesion',
    });

    expect(() => tokens.verificarTokenReseteo(token)).toThrow();
  });

  it('rechaza una firma adulterada', () => {
    const token = tokens.crearTokenConfirmacion('usuario@ejemplo.co');
    const partes = token.split('.');
    const firmaAdulterada = `${partes[0]}.${partes[1]}.${'a'.repeat((partes[2] ?? '').length)}`;

    expect(() => tokens.verificarTokenConfirmacion(firmaAdulterada)).toThrow();
  });

  it('expira el token de confirmacion al cumplirse su vida util', async () => {
    const servicioCorto = createTokenService({
      ...config,
      jwt: { ...config.jwt, confirmTtl: '1ms' },
    });
    const token = servicioCorto.crearTokenConfirmacion('usuario@ejemplo.co');

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(() => servicioCorto.verificarTokenConfirmacion(token)).toThrow();
  });
});
