/**
 * Pruebas de emision y verificacion de tokens firmados.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
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
});
