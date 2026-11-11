/**
 * Repositorio de intentos de inicio de sesion y de sesiones vivas sobre SQL Server.
 *
 * Una fila con successful = 0 es un intento fallido; una fila con successful = 1 es una sesion
 * abierta y por lo tanto guarda el refresh token hasheado.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import type { IRecordSet } from 'mssql';
import type { LogSession } from '../../domain/entities.js';
import type { LogSessionRepository } from '../../domain/ports.js';
import type { Database } from './pool.js';

interface LogSessionRow {
  uuid: string;
  uuid_usuario: string;
  successful: boolean;
  timestamp_intento: Date;
  refresh_token_hash: string | null;
  refresh_expires_at: Date | null;
  revoked_at: Date | null;
  rotado_en: Date | null;
}

const SELECT_LOG_SESSION = `
  SELECT uuid, uuid_usuario, successful, timestamp_intento,
         refresh_token_hash, refresh_expires_at, revoked_at, rotado_en
  FROM dbo.LogSession`;

const toLogSession = (row: LogSessionRow): LogSession => ({
  uuid: row.uuid,
  uuidUsuario: row.uuid_usuario,
  successful: row.successful,
  timestampIntento: row.timestamp_intento,
  refreshTokenHash: row.refresh_token_hash,
  refreshExpiresAt: row.refresh_expires_at,
  revokedAt: row.revoked_at,
  rotadoEn: row.rotado_en,
});

/**
 * Crea el repositorio de sesiones respaldado por el pool de conexiones indicado.
 */
export const createLogSessionRepository = (pool: Database): LogSessionRepository => ({
  registrarIntentoFallido: async (uuidUsuario: string): Promise<void> => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, randomUUID())
      .input('uuidUsuario', sql.UniqueIdentifier, uuidUsuario)
      .query(
        `INSERT INTO dbo.LogSession (uuid, uuid_usuario, successful, timestamp_intento)
         VALUES (@uuid, @uuidUsuario, 0, SYSUTCDATETIME())`,
      );
  },

  registrarSesion: async (
    uuidUsuario: string,
    refreshTokenHash: string,
    refreshExpiresAt: Date,
  ): Promise<LogSession> => {
    const uuid = randomUUID();
    const result = await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .input('uuidUsuario', sql.UniqueIdentifier, uuidUsuario)
      .input('refreshTokenHash', sql.Char(64), refreshTokenHash)
      .input('refreshExpiresAt', sql.DateTime2(3), refreshExpiresAt)
      .query<IRecordSet<LogSessionRow>>(
        `INSERT INTO dbo.LogSession
           (uuid, uuid_usuario, successful, timestamp_intento, refresh_token_hash, refresh_expires_at)
         OUTPUT INSERTED.uuid, INSERTED.uuid_usuario, INSERTED.successful, INSERTED.timestamp_intento,
                INSERTED.refresh_token_hash, INSERTED.refresh_expires_at, INSERTED.revoked_at,
                INSERTED.rotado_en
         VALUES (@uuid, @uuidUsuario, 1, SYSUTCDATETIME(), @refreshTokenHash, @refreshExpiresAt)`,
      );

    const fila = result.recordset[0];
    if (!fila) {
      throw new Error('No fue posible registrar la sesion del usuario.');
    }
    return toLogSession(fila);
  },

  rotarRefresh: async (
    uuid: string,
    refreshTokenHash: string,
    refreshExpiresAt: Date,
  ): Promise<void> => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .input('refreshTokenHash', sql.Char(64), refreshTokenHash)
      .input('refreshExpiresAt', sql.DateTime2(3), refreshExpiresAt)
      .query(
        `UPDATE dbo.LogSession
         SET refresh_token_hash = @refreshTokenHash,
             refresh_expires_at = @refreshExpiresAt,
             rotado_en = SYSUTCDATETIME()
         WHERE uuid = @uuid AND revoked_at IS NULL`,
      );
  },

  revocarSesion: async (uuid: string): Promise<void> => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .query(
        `UPDATE dbo.LogSession
         SET revoked_at = SYSUTCDATETIME()
         WHERE uuid = @uuid AND revoked_at IS NULL`,
      );
  },

  revocarSesionesDeUsuario: async (uuidUsuario: string): Promise<void> => {
    await pool
      .request()
      .input('uuidUsuario', sql.UniqueIdentifier, uuidUsuario)
      .query(
        `UPDATE dbo.LogSession
         SET revoked_at = SYSUTCDATETIME()
         WHERE uuid_usuario = @uuidUsuario
           AND revoked_at IS NULL
           AND refresh_token_hash IS NOT NULL`,
      );
  },

  contarIntentosFallidosDesdeUltimoExito: async (uuidUsuario: string): Promise<number> => {
    const result = await pool
      .request()
      .input('uuidUsuario', sql.UniqueIdentifier, uuidUsuario)
      .query<IRecordSet<{ total: number }>>(
        `SELECT COUNT_BIG(*) AS total
         FROM dbo.LogSession
         WHERE uuid_usuario = @uuidUsuario
           AND successful = 0
           AND timestamp_intento > COALESCE(
                 (SELECT MAX(timestamp_intento)
                  FROM dbo.LogSession
                  WHERE uuid_usuario = @uuidUsuario AND successful = 1),
                 CONVERT(DATETIME2(3), '1900-01-01'))`,
      );

    return Number(result.recordset[0]?.total ?? 0);
  },

  buscarSesionPorHash: async (refreshTokenHash: string): Promise<LogSession | null> => {
    const result = await pool
      .request()
      .input('refreshTokenHash', sql.Char(64), refreshTokenHash)
      .query<IRecordSet<LogSessionRow>>(
        `${SELECT_LOG_SESSION} WHERE refresh_token_hash = @refreshTokenHash`,
      );

    const fila = result.recordset[0];
    return fila ? toLogSession(fila) : null;
  },
});
