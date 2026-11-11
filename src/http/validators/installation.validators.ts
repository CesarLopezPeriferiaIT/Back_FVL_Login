/**
 * Validate public installation registration payloads.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { z } from 'zod';

export const instalacionSchema = z.object({
  nombre: z.string().min(1).max(128),
  tipo_cliente: z.enum(['mobile', 'web-bff', 'web']),
});
