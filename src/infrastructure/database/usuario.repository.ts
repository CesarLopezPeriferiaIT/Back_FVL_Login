/**
 * Repositorio de cuentas de usuario sobre SQL Server.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import sql from 'mssql';
import type { IRecordSet } from 'mssql';
import type { EstadoUsuario, Usuario } from '../../domain/entities.js';
import type { NuevoUsuario, UsuarioRepository } from '../../domain/ports.js';
import type { Database } from './pool.js';

interface UsuarioRow {
  uuid: string;
  Email: string;
  pass_hash: string;
  estado: string;
  fecha_creacion: Date;
  fecha_modificacion: Date;
  tyc: boolean;
}

const SELECT_USUARIO = `
  SELECT uuid, Email, pass_hash, estado, fecha_creacion, fecha_modificacion, tyc
  FROM dbo.Usuario`;

const toUsuario = (row: UsuarioRow): Usuario => ({
  uuid: row.uuid,
  email: row.Email,
  passHash: row.pass_hash,
  estado: row.estado.trim() as EstadoUsuario,
  fechaCreacion: row.fecha_creacion,
  fechaModificacion: row.fecha_modificacion,
  tyc: row.tyc,
});

/**
 * Crea el repositorio de usuarios respaldado por el pool de conexiones indicado.
 */
export const createUsuarioRepository = (pool: Database): UsuarioRepository => ({
  findByEmail: async (email: string): Promise<Usuario | null> => {
    const result = await pool
      .request()
      .input('email', sql.NVarChar(256), email)
      .query<IRecordSet<UsuarioRow>>(`${SELECT_USUARIO} WHERE Email = @email`);

    const fila = result.recordset[0];
    return fila ? toUsuario(fila) : null;
  },

  findByUuid: async (uuid: string): Promise<Usuario | null> => {
    const result = await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .query<IRecordSet<UsuarioRow>>(`${SELECT_USUARIO} WHERE uuid = @uuid`);

    const fila = result.recordset[0];
    return fila ? toUsuario(fila) : null;
  },

  create: async (nuevoUsuario: NuevoUsuario): Promise<Usuario> => {
    const result = await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, nuevoUsuario.uuid)
      .input('email', sql.NVarChar(256), nuevoUsuario.email)
      .input('passHash', sql.NVarChar(512), nuevoUsuario.passHash)
      .input('estado', sql.Char(1), nuevoUsuario.estado)
      .input('tyc', sql.Bit, nuevoUsuario.tyc)
      .query<IRecordSet<UsuarioRow>>(
        `INSERT INTO dbo.Usuario (uuid, Email, pass_hash, estado, fecha_creacion, fecha_modificacion, tyc)
         OUTPUT INSERTED.uuid, INSERTED.Email, INSERTED.pass_hash, INSERTED.estado,
                INSERTED.fecha_creacion, INSERTED.fecha_modificacion, INSERTED.tyc
         VALUES (@uuid, @email, @passHash, @estado, SYSUTCDATETIME(), SYSUTCDATETIME(), @tyc)`,
      );

    const fila = result.recordset[0];
    if (!fila) {
      throw new Error('No fue posible crear la cuenta de usuario.');
    }
    return toUsuario(fila);
  },

  updateEstado: async (uuid: string, estado: EstadoUsuario): Promise<void> => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .input('estado', sql.Char(1), estado)
      .query(
        `UPDATE dbo.Usuario
         SET estado = @estado, fecha_modificacion = SYSUTCDATETIME()
         WHERE uuid = @uuid`,
      );
  },

  updatePassword: async (uuid: string, passHash: string): Promise<void> => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .input('passHash', sql.NVarChar(512), passHash)
      .query(
        `UPDATE dbo.Usuario
         SET pass_hash = @passHash, fecha_modificacion = SYSUTCDATETIME()
         WHERE uuid = @uuid`,
      );
  },
});
