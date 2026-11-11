/**
 * Validate public installation registration payloads.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import { z } from 'zod';

export const instalacionSchema = z.object({
  nombre: z.string().min(1).max(128),
  tipo_cliente: z.enum(['mobile', 'web-bff', 'web']),
});
