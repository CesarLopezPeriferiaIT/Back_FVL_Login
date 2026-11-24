/**
 * SQL Server repository for email confirmation codes.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import sql from 'mssql';
import type { IRecordSet } from 'mssql';
import type { CodigoConfirmacionRepository } from '../../domain/ports.js';
import type { Database } from './pool.js';

interface CodigoRow {
  uuid: string;
  uuid_usuario: string;
  codigo_hash: string;
  expira_en: Date;
  intentos: number;
  invalidado: boolean;
  usado_en: Date | null;
}

/** Crea el repositorio de codigos respaldado por el pool indicado. */
export const createCodigoConfirmacionRepository = (
  pool: Database,
): CodigoConfirmacionRepository => ({
  guardar: async (codigo) => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, codigo.uuid)
      .input('uuidUsuario', sql.UniqueIdentifier, codigo.uuidUsuario)
      .input('codigoHash', sql.NVarChar(512), codigo.codigoHash)
      .input('expiraEn', sql.DateTime2(3), codigo.expiraEn)
      .input('intentos', sql.Int, codigo.intentos)
      .input('invalidado', sql.Bit, codigo.invalidado)
      .input('usadoEn', sql.DateTime2(3), codigo.usadoEn).query(`INSERT INTO dbo.codigo_confirmacion
        (uuid, uuid_usuario, codigo_hash, expira_en, intentos, invalidado, usado_en, fecha_creacion)
        VALUES (@uuid, @uuidUsuario, @codigoHash, @expiraEn, @intentos, @invalidado, @usadoEn, SYSUTCDATETIME())`);
  },
  buscarNoConsumidoPorUsuario: async (uuidUsuario) => {
    const result = await pool.request().input('uuidUsuario', sql.UniqueIdentifier, uuidUsuario)
      .query<
      IRecordSet<CodigoRow>
    >(`SELECT TOP 1 uuid, uuid_usuario, codigo_hash, expira_en, intentos, invalidado, usado_en
        FROM dbo.codigo_confirmacion WHERE uuid_usuario = @uuidUsuario AND usado_en IS NULL AND invalidado = 0
        ORDER BY fecha_creacion DESC`);
    const fila = result.recordset[0];
    return fila
      ? {
          uuid: fila.uuid,
          uuidUsuario: fila.uuid_usuario,
          codigoHash: fila.codigo_hash,
          expiraEn: fila.expira_en,
          intentos: fila.intentos,
          invalidado: fila.invalidado,
          usadoEn: fila.usado_en,
        }
      : null;
  },
  buscarUltimoPorUsuario: async (uuidUsuario) => {
    const result = await pool.request().input('uuidUsuario', sql.UniqueIdentifier, uuidUsuario)
      .query<
      IRecordSet<CodigoRow>
    >(`SELECT TOP 1 uuid, uuid_usuario, codigo_hash, expira_en, intentos, invalidado, usado_en
        FROM dbo.codigo_confirmacion WHERE uuid_usuario = @uuidUsuario ORDER BY fecha_creacion DESC`);
    const fila = result.recordset[0];
    return fila
      ? {
          uuid: fila.uuid,
          uuidUsuario: fila.uuid_usuario,
          codigoHash: fila.codigo_hash,
          expiraEn: fila.expira_en,
          intentos: fila.intentos,
          invalidado: fila.invalidado,
          usadoEn: fila.usado_en,
        }
      : null;
  },
  registrarIntentoFallido: async (uuid, maxIntentos) => {
    const result = await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .input('maxIntentos', sql.Int, maxIntentos)
      .query<IRecordSet<{ intentos: number; invalidado: boolean }>>(
        `UPDATE dbo.codigo_confirmacion SET intentos = intentos + 1,
        invalidado = CASE WHEN intentos + 1 >= @maxIntentos THEN 1 ELSE invalidado END
        OUTPUT INSERTED.intentos, INSERTED.invalidado
        WHERE uuid = @uuid AND usado_en IS NULL AND invalidado = 0`,
      );
    return result.recordset[0] ?? null;
  },
  marcarUsado: async (uuid) => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .query('UPDATE dbo.codigo_confirmacion SET usado_en = SYSUTCDATETIME() WHERE uuid = @uuid');
  },
  invalidar: async (uuid) => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .query('UPDATE dbo.codigo_confirmacion SET invalidado = 1 WHERE uuid = @uuid');
  },
});
