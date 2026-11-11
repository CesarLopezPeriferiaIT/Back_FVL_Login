/**
 * Genera y verifica hashes de contrasena con argon2id.
 *
 * Los lineamientos prohiben almacenar credenciales en texto plano, por lo que la contrasena solo
 * existe en memoria mientras dura la peticion.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { hash, verify } from '@node-rs/argon2';

/** Contrato de hasheo de contrasenas usado por la capa de aplicacion. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

/**
 * Parametros de coste de argon2id: 19 MiB de memoria, dos iteraciones y un hilo.
 *
 * Son los valores recomendados por OWASP para argon2id con una sola instancia de Node.js.
 */
const ARGUMENTOS_ARGON2 = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

/**
 * Crea el hasheador de contrasenas.
 */
export const createPasswordHasher = (): PasswordHasher => ({
  hash: (password: string): Promise<string> => hash(password, ARGUMENTOS_ARGON2),

  verify: async (passwordHash: string, password: string): Promise<boolean> => {
    try {
      return await verify(passwordHash, password);
    } catch {
      // Un hash corrupto o con otro algoritmo no puede verificarse: se trata como no coincide.
      return false;
    }
  },
});
