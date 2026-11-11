/**
 * Errores de aplicacion y utilidades para clasificar los errores del driver de base de datos.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */

/** Codigo de error de SQL Server para violacion de restriccion unica. */
const CODIGO_CLAVE_DUPLICADA = 2601;

/** Codigo de error de SQL Server para violacion de indice unico. */
const CODIGO_INDICE_DUPLICADO = 2627;

/**
 * Error de negocio con un codigo estable, un estado HTTP y un mensaje apto para el consumidor.
 */
export class AppError extends Error {
  readonly codigo: string;
  readonly status: number;
  readonly detalles: string[];

  constructor(codigo: string, mensaje: string, status: number, detalles: string[] = []) {
    super(mensaje);
    this.name = 'AppError';
    this.codigo = codigo;
    this.status = status;
    this.detalles = detalles;
  }
}

/** Extrae el codigo numerico de un error de SQL Server cuando lo tiene. */
const codigoDeError = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const candidato = error as { number?: unknown; originalError?: { info?: { number?: unknown } } };
  if (typeof candidato.number === 'number') {
    return candidato.number;
  }
  const anidado = candidato.originalError?.info?.number;
  return typeof anidado === 'number' ? anidado : null;
};

/**
 * Indica si el error corresponde a una violacion de unicidad, por ejemplo un correo ya registrado.
 */
export const esClaveDuplicada = (error: unknown): boolean => {
  const codigo = codigoDeError(error);
  return codigo === CODIGO_CLAVE_DUPLICADA || codigo === CODIGO_INDICE_DUPLICADO;
};
