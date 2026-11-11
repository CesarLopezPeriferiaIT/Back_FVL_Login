/**
 * Conversion de duraciones al estilo de jsonwebtoken a segundos.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */

/** Multiplicador de cada unidad de tiempo admitida. */
const SEGUNDOS_POR_UNIDAD: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * Convierte una duracion como "15m", "1h", "30s" o "7d" a su equivalente en segundos.
 *
 * @throws Error cuando la duracion no tiene un formato reconocible.
 */
export const duracionEnSegundos = (duracion: string): number => {
  const coincidencia = /^(\d+)\s*(s|m|h|d)$/.exec(duracion.trim());
  const cantidad = coincidencia?.[1];
  const unidad = coincidencia?.[2];

  if (cantidad === undefined || unidad === undefined) {
    throw new Error(`Duracion invalida: ${duracion}`);
  }

  return Number(cantidad) * (SEGUNDOS_POR_UNIDAD[unidad] ?? 1);
};
