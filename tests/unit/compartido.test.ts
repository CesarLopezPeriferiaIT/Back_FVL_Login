/**
 * Pruebas de las utilidades criptograficas y de normalizacion.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it } from 'vitest';
import {
  LONGITUD_PREFIJO_LOG,
  PREFIJO_API_KEY,
  generarApiKey,
  generarTokenAleatorio,
  prefijoDeClave,
  sha256,
} from '../../src/shared/crypto.js';
import { duracionEnSegundos } from '../../src/shared/duration.js';
import { normalizarEmail } from '../../src/shared/email.js';

describe('sha256', () => {
  it('produce el mismo hash para la misma entrada', () => {
    expect(sha256('clave')).toBe(sha256('clave'));
  });

  it('produce un hash de 64 caracteres hexadecimales', () => {
    expect(sha256('clave')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produce hashes distintos para entradas distintas', () => {
    expect(sha256('clave')).not.toBe(sha256('otra-clave'));
  });
});

describe('generarTokenAleatorio', () => {
  it('devuelve valores distintos en cada llamada', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generarTokenAleatorio()));
    expect(tokens.size).toBe(50);
  });

  it('devuelve un valor codificado en base64url sin caracteres problematicos', () => {
    expect(generarTokenAleatorio()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('generarApiKey', () => {
  it('antepone el prefijo institucional', () => {
    expect(generarApiKey().startsWith(PREFIJO_API_KEY)).toBe(true);
  });

  it('devuelve claves distintas en cada llamada', () => {
    expect(generarApiKey()).not.toBe(generarApiKey());
  });
});

describe('prefijoDeClave', () => {
  it('expone solo los primeros ocho caracteres', () => {
    const clave = 'fvl_abcdefghijklmnop';
    expect(prefijoDeClave(clave)).toBe('fvl_abcd');
    expect(prefijoDeClave(clave)).toHaveLength(LONGITUD_PREFIJO_LOG);
  });
});

describe('duracionEnSegundos', () => {
  it('convierte las unidades soportadas', () => {
    expect(duracionEnSegundos('30s')).toBe(30);
    expect(duracionEnSegundos('15m')).toBe(900);
    expect(duracionEnSegundos('2h')).toBe(7200);
    expect(duracionEnSegundos('7d')).toBe(604800);
  });

  it('rechaza un formato no valido', () => {
    expect(() => duracionEnSegundos('quince minutos')).toThrow();
    expect(() => duracionEnSegundos('15x')).toThrow();
  });
});

describe('normalizarEmail', () => {
  it('recorta los espacios y pasa a minusculas', () => {
    expect(normalizarEmail('  Usuario@Ejemplo.CO  ')).toBe('usuario@ejemplo.co');
  });
});
