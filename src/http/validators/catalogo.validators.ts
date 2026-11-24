/**
 * Validate catalog query parameters at the HTTP boundary.
 *
 * @author Jose Calpa <jose20calpa93@gmail.com>
 * @version 1.0.0
 */
import { z } from 'zod';

export const municipiosQuerySchema = z.object({
  department: z
    .string()
    .regex(/^\d{2}$/)
    .optional(),
});
