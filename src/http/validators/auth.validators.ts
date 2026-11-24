/**
 * Validate authentication request payloads at the HTTP boundary.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { z } from 'zod';
import { normalizarEmail } from '../../shared/email.js';

const email = z.email().transform(normalizarEmail);
export const registroSchema = z
  .object({
    email,
    tyc: z.boolean(),
    codigo_departamento: z.string().regex(/^\d{2}$/),
    codigo_municipio: z.string().regex(/^\d{5}$/),
    codigo_rol: z.number().int().positive(),
  })
  // El codigo DANE del municipio empieza por el del departamento al que pertenece.
  .refine((datos) => datos.codigo_municipio.startsWith(datos.codigo_departamento), {
    path: ['codigo_municipio'],
    message: 'El municipio no pertenece al departamento indicado.',
  });
export const loginSchema = z.object({ email });
export const loginCodigoSchema = z.object({ email, codigo: z.string().regex(/^\d{6}$/) });
export const confirmacionSchema = z.object({ email, codigo: z.string().regex(/^\d{6}$/) });
export const refreshSchema = z.object({ refresh_token: z.string().min(1) });
