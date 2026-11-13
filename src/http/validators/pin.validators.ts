/**
 * Valida las cargas utiles de los endpoints de pin de acceso.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { z } from 'zod';

/**
 * El pin son solo digitos: un pin con letras se confunde al escribirlo y no aporta seguridad.
 */
export const pinConfiguracionSchema = z.object({
  pin: z.string().regex(/^\d{4,12}$/, 'El pin debe tener entre 4 y 12 digitos.'),
  dispositivo: z.string().min(1).max(128),
});

export const pinVerificacionSchema = z.object({
  pin: z.string().regex(/^\d{4,12}$/, 'El pin debe tener entre 4 y 12 digitos.'),
});
