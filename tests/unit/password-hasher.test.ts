/**
 * Pruebas del hasheo de contrasenas con argon2id.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from '../../src/domain/password-hasher.js';

const hasher = createPasswordHasher();

describe('hasheador de contrasenas', () => {
  it('genera un hash que no contiene la contrasena en texto plano', async () => {
    const hash = await hasher.hash('ClaveSegura1');
    expect(hash).not.toContain('ClaveSegura1');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('verifica la contrasena correcta', async () => {
    const hash = await hasher.hash('ClaveSegura1');
    await expect(hasher.verify(hash, 'ClaveSegura1')).resolves.toBe(true);
  });

  it('rechaza la contrasena incorrecta', async () => {
    const hash = await hasher.hash('ClaveSegura1');
    await expect(hasher.verify(hash, 'ClaveIncorrecta1')).resolves.toBe(false);
  });

  it('produce un hash distinto en cada ejecucion por la sal aleatoria', async () => {
    const primero = await hasher.hash('ClaveSegura1');
    const segundo = await hasher.hash('ClaveSegura1');
    expect(primero).not.toBe(segundo);
  });

  it('devuelve false cuando el hash almacenado no es valido', async () => {
    await expect(hasher.verify('no-es-un-hash', 'ClaveSegura1')).resolves.toBe(false);
  });
});
