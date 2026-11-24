/**
 * Validate authentication request payloads at the HTTP boundary.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { z } from 'zod';
import { normalizarEmail } from '../../shared/email.js';

const email = z.email().transform(normalizarEmail);
const password = z.string().regex(/^(?=.*[A-Za-z])(?=.*\d)\S{8,72}$/);
export const registroSchema = z.object({ email, password, tyc: z.boolean() });
export const loginSchema = z.object({ email, password });
export const tokenSchema = z.object({ token: z.string().min(1) });
export const refreshSchema = z.object({ refresh_token: z.string().min(1) });
