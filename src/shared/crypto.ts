/**
 * Utilidades criptograficas usadas para hashear credenciales y generar material aleatorio.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { createHash, randomBytes } from 'node:crypto';

/** Prefijo identificador de las API Key emitidas por el servicio. */
export const PREFIJO_API_KEY = 'fvl_';

/** Longitud en caracteres que se expone en los logs para identificar una API Key. */
export const LONGITUD_PREFIJO_LOG = 8;

/**
 * Calcula el hash SHA-256 de un valor en hexadecimal.
 *
 * Se usa para las API Key y para los refresh tokens, que no requieren un algoritmo de derivacion
 * lento porque su vida util es corta y su valor es aleatorio.
 */
export const sha256 = (valor: string): string =>
  createHash('sha256').update(valor, 'utf8').digest('hex');

/**
 * Genera un token aleatorio opaco codificado en base64url.
 */
export const generarTokenAleatorio = (bytes = 32): string =>
  randomBytes(bytes).toString('base64url');

/**
 * Genera una API Key con el prefijo institucional.
 *
 * El valor en texto plano se entrega una sola vez al cliente; en la base de datos solo queda
 * su hash SHA-256.
 */
export const generarApiKey = (): string =>
  `${PREFIJO_API_KEY}${randomBytes(24).toString('base64url')}`;

/**
 * Extrae el prefijo de una API Key para poder identificarla en los logs sin exponerla.
 */
export const prefijoDeClave = (clave: string): string => clave.slice(0, LONGITUD_PREFIJO_LOG);
