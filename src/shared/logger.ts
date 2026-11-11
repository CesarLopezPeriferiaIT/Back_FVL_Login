/**
 * Logger estructurado que emite una linea JSON por evento.
 *
 * Los eventos se escriben en la salida estandar para que los pueda recolectar el orquestador de
 * infraestructura sin depender de un formato propietario.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */

/** Niveles de detalle soportados por el logger. */
export type NivelLog = 'debug' | 'info' | 'warn' | 'error';

const ORDEN_NIVELES: Record<NivelLog, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** Contrato de logging utilizado por el resto de la aplicacion. */
export interface Logger {
  debug(mensaje: string, contexto?: Record<string, unknown>): void;
  info(mensaje: string, contexto?: Record<string, unknown>): void;
  warn(mensaje: string, contexto?: Record<string, unknown>): void;
  error(mensaje: string, contexto?: Record<string, unknown>): void;
}

const serializar = (nivel: NivelLog, mensaje: string, contexto: Record<string, unknown>): string =>
  JSON.stringify({
    timestamp: new Date().toISOString(),
    nivel,
    mensaje,
    ...contexto,
  });

const escribir = (
  nivel: NivelLog,
  mensaje: string,
  contexto: Record<string, unknown> | undefined,
): void => {
  const linea = serializar(nivel, mensaje, contexto ?? {});
  if (nivel === 'error' || nivel === 'warn') {
    process.stderr.write(`${linea}\n`);
    return;
  }
  process.stdout.write(`${linea}\n`);
};

/**
 * Crea un logger que descarta los eventos de menor severidad que el nivel configurado.
 */
export const createLogger = (nivelMinimo: NivelLog): Logger => {
  const emitir = (nivel: NivelLog) => (mensaje: string, contexto?: Record<string, unknown>) => {
    if (ORDEN_NIVELES[nivel] < ORDEN_NIVELES[nivelMinimo]) {
      return;
    }
    escribir(nivel, mensaje, contexto);
  };

  return {
    debug: emitir('debug'),
    info: emitir('info'),
    warn: emitir('warn'),
    error: emitir('error'),
  };
};
