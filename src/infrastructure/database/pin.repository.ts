/**
 * Repositorio de los pines de acceso de las cuentas sobre SQL Server.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import sql from 'mssql';
import type { IRecordSet } from 'mssql';
import type { PinAcceso } from '../../domain/entities.js';
import type { NuevoPin, PinRepository } from '../../domain/ports.js';
import type { Database } from './pool.js';

interface PinRow {
  uuid: string;
  uuid_usuario: string;
  dispositivo: string;
  hash: string;
  intentos_fallidos: number;
  revocado: boolean;
  fecha_creacion: Date;
  fecha_modificacion: Date;
  ultimo_uso: Date | null;
}

const SELECT_PIN = `
  SELECT uuid, uuid_usuario, dispositivo, hash, intentos_fallidos, revocado,
         fecha_creacion, fecha_modificacion, ultimo_uso
  FROM dbo.pin_acceso`;

const toPinAcceso = (row: PinRow): PinAcceso => ({
  uuid: row.uuid,
  uuidUsuario: row.uuid_usuario,
  dispositivo: row.dispositivo,
  hash: row.hash,
  intentosFallidos: row.intentos_fallidos,
  revocado: row.revocado,
  fechaCreacion: row.fecha_creacion,
  fechaModificacion: row.fecha_modificacion,
  ultimoUso: row.ultimo_uso,
});

/**
 * Crea el repositorio de pines respaldado por el pool de conexiones indicado.
 */
export const createPinRepository = (pool: Database): PinRepository => ({
  buscarActivo: async (uuidUsuario: string): Promise<PinAcceso | null> => {
    const result = await pool
      .request()
      .input('uuidUsuario', sql.UniqueIdentifier, uuidUsuario)
      .query<IRecordSet<PinRow>>(
        `${SELECT_PIN} WHERE uuid_usuario = @uuidUsuario AND revocado = 0`,
      );

    const fila = result.recordset[0];
    return fila ? toPinAcceso(fila) : null;
  },

  crear: async (pin: NuevoPin): Promise<PinAcceso> => {
    const result = await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, pin.uuid)
      .input('uuidUsuario', sql.UniqueIdentifier, pin.uuidUsuario)
      .input('dispositivo', sql.NVarChar(128), pin.dispositivo)
      .input('hash', sql.NVarChar(512), pin.hash)
      .query<IRecordSet<PinRow>>(
        `INSERT INTO dbo.pin_acceso
           (uuid, uuid_usuario, dispositivo, hash, intentos_fallidos, revocado,
            fecha_creacion, fecha_modificacion)
         OUTPUT INSERTED.uuid, INSERTED.uuid_usuario, INSERTED.dispositivo, INSERTED.hash,
                INSERTED.intentos_fallidos, INSERTED.revocado, INSERTED.fecha_creacion,
                INSERTED.fecha_modificacion, INSERTED.ultimo_uso
         VALUES (@uuid, @uuidUsuario, @dispositivo, @hash, 0, 0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      );

    const fila = result.recordset[0];
    if (!fila) {
      throw new Error('No fue posible registrar el pin de acceso.');
    }
    return toPinAcceso(fila);
  },

  registrarIntentoFallido: async (uuid: string): Promise<void> => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .query(
        `UPDATE dbo.pin_acceso
         SET intentos_fallidos = intentos_fallidos + 1,
             fecha_modificacion = SYSUTCDATETIME()
         WHERE uuid = @uuid`,
      );
  },

  registrarUso: async (uuid: string): Promise<void> => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .query(
        `UPDATE dbo.pin_acceso
         SET intentos_fallidos = 0,
             ultimo_uso = SYSUTCDATETIME(),
             fecha_modificacion = SYSUTCDATETIME()
         WHERE uuid = @uuid`,
      );
  },

  revocarActivos: async (uuidUsuario: string): Promise<void> => {
    await pool
      .request()
      .input('uuidUsuario', sql.UniqueIdentifier, uuidUsuario)
      .query(
        `UPDATE dbo.pin_acceso
         SET revocado = 1,
             fecha_modificacion = SYSUTCDATETIME()
         WHERE uuid_usuario = @uuidUsuario
           AND revocado = 0`,
      );
  },
});
