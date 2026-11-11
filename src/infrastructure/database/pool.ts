/**
 * Pool de conexiones contra SQL Server.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import sql from 'mssql';
import type { AppConfig } from '../../config/env.js';

/** Pool de conexiones a SQL Server usado por los repositorios. */
export type Database = sql.ConnectionPool;

/**
 * Crea el pool de conexiones y verifica la conectividad con el servidor.
 *
 * @throws Error cuando el servidor no responde o las credenciales son invalidas.
 */
export const createPool = async (config: AppConfig): Promise<Database> => {
  const pool = new sql.ConnectionPool({
    server: config.db.server,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    connectionTimeout: config.db.connectTimeoutMs,
    pool: {
      max: config.db.poolMax,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: config.db.encrypt,
      trustServerCertificate: config.db.trustServerCertificate,
    },
  });

  await pool.connect();
  return pool;
};

/** Cierra el pool de conexiones liberando los recursos del proceso. */
export const closePool = async (pool: Database): Promise<void> => {
  await pool.close();
};
