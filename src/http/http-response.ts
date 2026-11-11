/**
 * Present consistent JSON responses to API clients.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import type { Response } from 'express';

export const responderOk = (res: Response, message: string, data: unknown, status = 200): void => {
  res.status(status).json({ message, error: null, code: 0, data });
};

export const responderError = (
  res: Response,
  status: number,
  codigo: string,
  message: string,
  detalles: string[] = [],
): void => {
  res.status(status).json({ message, error: { codigo, detalles }, code: status, data: null });
};
