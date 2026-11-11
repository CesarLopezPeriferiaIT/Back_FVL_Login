/**
 * Repositorio de credenciales de cliente (API Key) sobre SQL Server.
 *
 * Solo se persiste el hash SHA-256 de la clave: el valor en texto plano se entrega una unica
 * vez al cliente durante el registro de la instalacion.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import sql from 'mssql';
import type { IRecordSet } from 'mssql';
import type { ApiKey, Permiso, TipoCliente } from '../../domain/entities.js';
import type { ApiKeyRepository, NuevaApiKey } from '../../domain/ports.js';
import type { Database } from './pool.js';

interface ApiKeyRow {
  uuid: string;
  key_hash: string;
  nombre: string;
  tipo_cliente: string;
  permisos: string;
  revocado: boolean;
  fecha_creacion: Date;
  fecha_modificacion: Date;
  ultimo_uso: Date | null;
}

const SELECT_API_KEY = `
  SELECT uuid, key_hash, nombre, tipo_cliente, permisos, revocado,
         fecha_creacion, fecha_modificacion, ultimo_uso
  FROM dbo.ApiKey`;

const PERMISOS_VALIDOS: readonly Permiso[] = [
  'auth:register',
  'auth:login',
  'auth:confirm-email',
  'auth:refresh',
  'auth:logout',
  'auth:password-reset',
  'auth:me',
];

const parsearPermisos = (valor: string): Permiso[] =>
  valor
    .split(',')
    .map((permiso) => permiso.trim())
    .filter((permiso): permiso is Permiso =>
      (PERMISOS_VALIDOS as readonly string[]).includes(permiso),
    );

const toApiKey = (row: ApiKeyRow): ApiKey => ({
  uuid: row.uuid,
  keyHash: row.key_hash,
  nombre: row.nombre,
  tipoCliente: row.tipo_cliente.trim() as TipoCliente,
  permisos: parsearPermisos(row.permisos),
  revocado: row.revocado,
  fechaCreacion: row.fecha_creacion,
  fechaModificacion: row.fecha_modificacion,
  ultimoUso: row.ultimo_uso,
});

/**
 * Crea el repositorio de credenciales de cliente respaldado por el pool de conexiones indicado.
 */
export const createApiKeyRepository = (pool: Database): ApiKeyRepository => ({
  findByHash: async (keyHash: string): Promise<ApiKey | null> => {
    const result = await pool
      .request()
      .input('keyHash', sql.Char(64), keyHash)
      .query<IRecordSet<ApiKeyRow>>(`${SELECT_API_KEY} WHERE key_hash = @keyHash`);

    const fila = result.recordset[0];
    return fila ? toApiKey(fila) : null;
  },

  create: async (nuevaApiKey: NuevaApiKey): Promise<ApiKey> => {
    const result = await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, nuevaApiKey.uuid)
      .input('keyHash', sql.Char(64), nuevaApiKey.keyHash)
      .input('nombre', sql.NVarChar(128), nuevaApiKey.nombre)
      .input('tipoCliente', sql.Char(8), nuevaApiKey.tipoCliente)
      .input('permisos', sql.NVarChar(512), nuevaApiKey.permisos.join(','))
      .query<IRecordSet<ApiKeyRow>>(
        `INSERT INTO dbo.ApiKey
           (uuid, key_hash, nombre, tipo_cliente, permisos, revocado, fecha_creacion, fecha_modificacion)
         OUTPUT INSERTED.uuid, INSERTED.key_hash, INSERTED.nombre, INSERTED.tipo_cliente,
                INSERTED.permisos, INSERTED.revocado, INSERTED.fecha_creacion,
                INSERTED.fecha_modificacion, INSERTED.ultimo_uso
         VALUES (@uuid, @keyHash, @nombre, @tipoCliente, @permisos, 0, SYSUTCDATETIME(),
                 SYSUTCDATETIME())`,
      );

    const fila = result.recordset[0];
    if (!fila) {
      throw new Error('No fue posible registrar la credencial de cliente.');
    }
    return toApiKey(fila);
  },

  registrarUso: async (uuid: string): Promise<void> => {
    await pool
      .request()
      .input('uuid', sql.UniqueIdentifier, uuid)
      .query(
        `UPDATE dbo.ApiKey
         SET ultimo_uso = SYSUTCDATETIME()
         WHERE uuid = @uuid`,
      );
  },
});
