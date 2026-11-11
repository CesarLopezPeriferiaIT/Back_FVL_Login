/**
 * Verify the SQL Server connection pool is created and closed with the expected settings.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it, vi } from 'vitest';
import { configDePrueba } from '../helpers/config.js';

const { connectSpy, closeSpy } = vi.hoisted(() => ({
  connectSpy: vi.fn(async () => undefined),
  closeSpy: vi.fn(async () => undefined),
}));

vi.mock('mssql', () => {
  class ConnectionPool {
    config: unknown;
    connect = connectSpy;
    close = closeSpy;

    constructor(config: unknown) {
      this.config = config;
    }
  }

  return { default: { ConnectionPool }, ConnectionPool };
});

const { closePool, createPool } = await import('../../src/infrastructure/database/pool.js');

interface PoolSimulado {
  config: {
    server: string;
    port: number;
    database: string;
    user: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    options: { encrypt: boolean; trustServerCertificate: boolean };
    pool: { max: number };
  };
}

describe('pool de SQL Server', () => {
  it('conecta con la configuracion de la base de datos y el cifrado activo', async () => {
    connectSpy.mockClear();

    const pool = await createPool(configDePrueba());

    expect(connectSpy).toHaveBeenCalledTimes(1);
    const configuracion = (pool as unknown as PoolSimulado).config;
    expect(configuracion.server).toBe('localhost');
    expect(configuracion.port).toBe(1433);
    expect(configuracion.database).toBe('FVL_Login');
    expect(configuracion.user).toBe('fvl_login_app');
    expect(configuracion.options.encrypt).toBe(true);
    expect(configuracion.options.trustServerCertificate).toBe(true);
    expect(configuracion.pool.max).toBe(5);
  });

  it('cierra el pool liberando los recursos del proceso', async () => {
    closeSpy.mockClear();

    const pool = await createPool(configDePrueba());
    await closePool(pool);

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
