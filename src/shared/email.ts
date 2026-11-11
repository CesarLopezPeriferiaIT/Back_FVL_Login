/**
 * Normalizacion de direcciones de correo electronico.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */

/**
 * Normaliza un correo para que las comparaciones y los indices unicos no dependan de las
 * mayusculas ni de los espacios accidentales.
 */
export const normalizarEmail = (email: string): string => email.trim().toLowerCase();
