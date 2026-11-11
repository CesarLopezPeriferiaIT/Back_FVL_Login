/**
 * Normalizacion de direcciones de correo electronico.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */

/**
 * Normaliza un correo para que las comparaciones y los indices unicos no dependan de las
 * mayusculas ni de los espacios accidentales.
 */
export const normalizarEmail = (email: string): string => email.trim().toLowerCase();
