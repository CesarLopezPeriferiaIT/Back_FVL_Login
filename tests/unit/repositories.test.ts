/**
 * Verify SQL repository queries use parameters, map rows correctly and fail safely.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import { describe, expect, it } from 'vitest';
import { createCodigoLoginRepository } from '../../src/infrastructure/database/codigo-login.repository.js';
import { createCodigoConfirmacionRepository } from '../../src/infrastructure/database/codigo-confirmacion.repository.js';
import { createApiKeyRepository } from '../../src/infrastructure/database/api-key.repository.js';
import { createCatalogoRepository } from '../../src/infrastructure/database/catalogo.repository.js';
import { createLogSessionRepository } from '../../src/infrastructure/database/log-session.repository.js';
import type { Database } from '../../src/infrastructure/database/pool.js';
import { createUsuarioRepository } from '../../src/infrastructure/database/usuario.repository.js';

interface Consulta {
  sql: string;
  parametros: Record<string, unknown>;
}

const filaUsuario = (): Record<string, unknown> => ({
  uuid: 'uuid-usuario',
  Email: 'usuario@ejemplo.co',
  estado: 'A',
  fecha_creacion: new Date('2026-01-01T10:00:00.000Z'),
  fecha_modificacion: new Date('2026-01-02T10:00:00.000Z'),
  tyc: true,
});

const filaSesion = (): Record<string, unknown> => ({
  uuid: 'uuid-sesion',
  uuid_usuario: 'uuid-usuario',
  successful: true,
  timestamp_intento: new Date('2026-01-01T10:00:00.000Z'),
  refresh_token_hash: 'a'.repeat(64),
  refresh_expires_at: new Date('2026-02-01T10:00:00.000Z'),
  revoked_at: null,
  rotado_en: null,
});

const filaApiKey = (): Record<string, unknown> => ({
  uuid: 'uuid-clave',
  key_hash: 'b'.repeat(64),
  nombre: 'App movil',
  tipo_cliente: 'mobile',
  permisos: 'auth:login,auth:me,permiso-inexistente',
  revocado: false,
  fecha_creacion: new Date('2026-01-01T10:00:00.000Z'),
  fecha_modificacion: new Date('2026-01-01T10:00:00.000Z'),
  ultimo_uso: null,
});

const crearPoolFalso = (
  resultados: Record<string, unknown>[][] = [],
): { pool: Database; consultas: Consulta[] } => {
  const consultas: Consulta[] = [];
  let indice = 0;

  const request = (): object => {
    const parametros: Record<string, unknown> = {};
    const encadenado = {
      input: (nombre: string, _tipo: unknown, valor: unknown) => {
        parametros[nombre] = valor;
        return encadenado;
      },
      query: async (texto: string) => {
        consultas.push({ sql: texto, parametros: { ...parametros } });
        const recordset = resultados[indice] ?? [];
        indice += 1;
        return { recordset };
      },
    };
    return encadenado;
  };

  return { pool: { request } as unknown as Database, consultas };
};

const comprobarConsulta = (
  consulta: Consulta | undefined,
  tabla: string,
  condicion: string,
  parametro: string,
  valor: string,
): void => {
  expect(consulta).toBeDefined();
  expect(consulta?.sql).toContain(tabla);
  expect(consulta?.sql).toContain(condicion);
  expect(consulta?.sql).not.toContain(valor);
  expect(consulta?.parametros[parametro]).toBe(valor);
};

describe('parametrizacion de las consultas', () => {
  it('parametriza las busquedas y actualizaciones de usuarios', async () => {
    const { pool, consultas } = crearPoolFalso();
    const repo = createUsuarioRepository(pool);
    const valor = "valor-inyectado' OR 1=1";
    expect(await repo.findByEmail(valor)).toBeNull();
    expect(await repo.findByUuid(valor)).toBeNull();
    await repo.updateEstado(valor, 'D');
    comprobarConsulta(consultas[0], 'dbo.usuario', 'WHERE Email = @email', 'email', valor);
    for (const consulta of consultas.slice(1)) {
      comprobarConsulta(consulta, 'dbo.usuario', 'WHERE uuid = @uuid', 'uuid', valor);
    }
    expect(consultas[2]?.parametros.estado).toBe('D');
  });

  it('parametriza las consultas y la revocacion de sesiones', async () => {
    const { pool, consultas } = crearPoolFalso();
    const repo = createLogSessionRepository(pool);
    const valor = "valor-inyectado' OR 1=1";
    await repo.registrarIntentoFallido(valor);
    await repo.rotarRefresh(valor, 'hash', new Date('2030-01-01'));
    await repo.revocarSesion(valor);
    expect(await repo.contarIntentosFallidosDesdeUltimoExito(valor)).toBe(0);
    expect(await repo.buscarSesionPorHash(valor)).toBeNull();
    comprobarConsulta(consultas[0], 'dbo.log_session', '@uuidUsuario', 'uuidUsuario', valor);
    for (const consulta of consultas.slice(1, 3)) {
      comprobarConsulta(consulta, 'dbo.log_session', 'WHERE uuid = @uuid', 'uuid', valor);
    }
    comprobarConsulta(
      consultas[3],
      'dbo.log_session',
      'uuid_usuario = @uuidUsuario',
      'uuidUsuario',
      valor,
    );
    expect(consultas[3]?.sql).toContain('successful = 0');
    expect(consultas[3]?.sql).toContain('MAX(timestamp_intento)');
    expect(consultas[3]?.sql).toContain('successful = 1');
    expect(consultas[3]?.sql).toContain('timestamp_intento > COALESCE');
    comprobarConsulta(
      consultas[4],
      'dbo.log_session',
      'WHERE refresh_token_hash = @refreshTokenHash',
      'refreshTokenHash',
      valor,
    );
  });

  it('parametriza las busquedas y el registro de uso de API keys', async () => {
    const { pool, consultas } = crearPoolFalso();
    const repo = createApiKeyRepository(pool);
    const valor = "valor-inyectado' OR 1=1";
    expect(await repo.findByHash(valor)).toBeNull();
    await repo.registrarUso(valor);
    comprobarConsulta(consultas[0], 'dbo.api_key', 'WHERE key_hash = @keyHash', 'keyHash', valor);
    comprobarConsulta(consultas[1], 'dbo.api_key', 'WHERE uuid = @uuid', 'uuid', valor);
  });
});

describe('mapeo de las filas devueltas', () => {
  it('devuelve la cuenta encontrada con el estado recortado', async () => {
    const { pool } = crearPoolFalso([[filaUsuario()]]);
    const repo = createUsuarioRepository(pool);

    const usuario = await repo.findByEmail('usuario@ejemplo.co');

    expect(usuario?.uuid).toBe('uuid-usuario');
    expect(usuario?.email).toBe('usuario@ejemplo.co');
    expect(usuario?.estado).toBe('A');
    expect(usuario?.tyc).toBe(true);
    expect(usuario?.fechaCreacion).toBeInstanceOf(Date);
  });

  it('devuelve la cuenta creada y falla cuando la insercion no devuelve fila', async () => {
    const { pool, consultas } = crearPoolFalso([[filaUsuario()], []]);
    const repo = createUsuarioRepository(pool);

    const creado = await repo.create({
      uuid: 'uuid-usuario',
      email: 'usuario@ejemplo.co',
      estado: 'C',
      tyc: true,
      codigoDepartamento: '76',
      codigoMunicipio: '76001',
      codigoRol: 1,
    });

    expect(creado.uuid).toBe('uuid-usuario');
    expect(consultas[0]?.sql).toContain('INSERT INTO dbo.usuario');
    expect(consultas[0]?.parametros.estado).toBe('C');
    expect(consultas[0]?.parametros).toMatchObject({
      codigoDepartamento: '76',
      codigoMunicipio: '76001',
      codigoRol: 1,
    });

    await expect(
      repo.create({
        uuid: 'uuid-usuario',
        email: 'usuario@ejemplo.co',
        estado: 'C',
        tyc: true,
        codigoDepartamento: '76',
        codigoMunicipio: '76001',
        codigoRol: 1,
      }),
    ).rejects.toThrow('No fue posible crear la cuenta de usuario.');
  });

  it('devuelve la sesion registrada y la que busca por hash', async () => {
    const { pool } = crearPoolFalso([[filaSesion()], [filaSesion()]]);
    const repo = createLogSessionRepository(pool);

    const sesion = await repo.registrarSesion(
      'uuid-usuario',
      'a'.repeat(64),
      new Date('2026-02-01T10:00:00.000Z'),
    );
    expect(sesion.uuid).toBe('uuid-sesion');
    expect(sesion.refreshTokenHash).toBe('a'.repeat(64));
    expect(sesion.revokedAt).toBeNull();

    const encontrada = await repo.buscarSesionPorHash('a'.repeat(64));
    expect(encontrada?.uuidUsuario).toBe('uuid-usuario');
  });

  it('falla cuando la sesion no se puede registrar', async () => {
    const { pool } = crearPoolFalso([[]]);
    const repo = createLogSessionRepository(pool);

    await expect(
      repo.registrarSesion('uuid-usuario', 'a'.repeat(64), new Date('2030-01-01')),
    ).rejects.toThrow('No fue posible registrar la sesion del usuario.');
  });

  it('devuelve el conteo de intentos fallidos y cero cuando no hay filas', async () => {
    const { pool } = crearPoolFalso([[{ total: 7 }], []]);
    const repo = createLogSessionRepository(pool);

    expect(await repo.contarIntentosFallidosDesdeUltimoExito('uuid-usuario')).toBe(7);
    expect(await repo.contarIntentosFallidosDesdeUltimoExito('uuid-usuario')).toBe(0);
  });

  it('devuelve la credencial encontrada y filtra los permisos desconocidos', async () => {
    const { pool } = crearPoolFalso([[filaApiKey()]]);
    const repo = createApiKeyRepository(pool);

    const apiKey = await repo.findByHash('b'.repeat(64));

    expect(apiKey?.nombre).toBe('App movil');
    expect(apiKey?.tipoCliente).toBe('mobile');
    expect(apiKey?.permisos).toEqual(['auth:login', 'auth:me']);
    expect(apiKey?.revocado).toBe(false);
  });

  it('falla cuando la credencial no se puede registrar', async () => {
    const { pool } = crearPoolFalso([[]]);
    const repo = createApiKeyRepository(pool);

    await expect(
      repo.create({
        uuid: 'uuid-clave',
        keyHash: 'b'.repeat(64),
        nombre: 'App movil',
        tipoCliente: 'mobile',
        permisos: ['auth:login'],
      }),
    ).rejects.toThrow('No fue posible registrar la credencial de cliente.');
  });
});

describe('repositorio de codigos de confirmacion', () => {
  it('consulta el ultimo codigo sin filtrar su estado', async () => {
    const { pool, consultas } = crearPoolFalso([[]]);
    const repo = createCodigoConfirmacionRepository(pool);
    expect(await repo.buscarUltimoPorUsuario('usuario')).toBeNull();
    expect(consultas[0]?.sql).toContain('ORDER BY fecha_creacion DESC');
    expect(consultas[0]?.sql).not.toContain('invalidado = 0');
  });
  it('persiste, consulta y actualiza el codigo', async () => {
    const expiraEn = new Date('2020-01-01');
    const codigo = {
      uuid: 'codigo',
      uuidUsuario: 'usuario',
      codigoHash: 'hash',
      expiraEn,
      intentos: 2,
      invalidado: false,
      usadoEn: null,
    };
    const fila = {
      uuid: 'codigo',
      uuid_usuario: 'usuario',
      codigo_hash: 'hash',
      expira_en: expiraEn,
      intentos: 2,
      invalidado: false,
      usado_en: null,
    };
    const { pool, consultas } = crearPoolFalso([
      [],
      [fila],
      [],
      [{ intentos: 3, invalidado: false }],
      [],
      [],
    ]);
    const repo = createCodigoConfirmacionRepository(pool);
    await repo.guardar(codigo);
    expect(consultas[0]?.sql).toContain('INSERT INTO dbo.codigo_confirmacion');
    expect(consultas[0]?.parametros).toEqual(codigo);
    expect(await repo.buscarNoConsumidoPorUsuario('usuario')).toEqual(codigo);
    expect(consultas[1]?.sql).toContain('usado_en IS NULL AND invalidado = 0');
    expect(consultas[1]?.sql).toContain('fecha_creacion DESC');
    expect(consultas[1]?.sql).not.toMatch(/expira_en\s*[><]/);
    expect(await repo.buscarNoConsumidoPorUsuario('usuario')).toBeNull();
    expect(await repo.registrarIntentoFallido('codigo', 5)).toEqual({
      intentos: 3,
      invalidado: false,
    });
    expect(consultas[3]?.parametros.maxIntentos).toBe(5);
    expect(consultas[3]?.sql).toContain(
      'invalidado = CASE WHEN intentos + 1 >= @maxIntentos THEN 1 ELSE invalidado END',
    );
    expect(consultas[3]?.sql).toContain(
      'WHERE uuid = @uuid AND usado_en IS NULL AND invalidado = 0 AND expira_en > SYSUTCDATETIME()',
    );
    expect(consultas[3]?.sql).toContain('intentos = intentos + 1');
    expect(consultas[3]?.sql).toContain('OUTPUT INSERTED.intentos');
    await repo.marcarUsado('codigo');
    expect(consultas[4]?.sql).toContain('usado_en = SYSUTCDATETIME()');
    await repo.invalidar('codigo');
    expect(consultas[5]?.sql).toContain('invalidado = 1');
  });
});

describe('repositorio de codigos de acceso', () => {
  it('persiste, consulta y consume codigos atomicamente', async () => {
    const codigo = {
      uuid: 'codigo',
      uuidUsuario: 'usuario',
      codigoHash: 'hash',
      expiraEn: new Date('2020-01-01'),
      intentos: 2,
      invalidado: false,
      usadoEn: null,
    };
    const fila = {
      uuid: codigo.uuid,
      uuid_usuario: codigo.uuidUsuario,
      codigo_hash: codigo.codigoHash,
      expira_en: codigo.expiraEn,
      intentos: 2,
      invalidado: false,
      usado_en: null,
    };
    const { pool, consultas } = crearPoolFalso([
      [],
      [fila],
      [fila],
      [{ intentos: 3, invalidado: false }],
      [{ uuid: 'codigo' }],
      [],
      [],
    ]);
    const repo = createCodigoLoginRepository(pool);
    await repo.guardar(codigo);
    expect(consultas[0]?.sql).toContain('INSERT INTO dbo.codigo_login');
    expect(consultas[0]?.sql).toContain(
      '(uuid, uuid_usuario, codigo_hash, expira_en, intentos, invalidado, usado_en, fecha_creacion)',
    );
    expect(consultas[0]?.parametros).toEqual(codigo);
    expect(await repo.buscarNoConsumidoPorUsuario('usuario')).toEqual(codigo);
    expect(consultas[1]?.sql).toContain('usado_en IS NULL AND invalidado = 0');
    expect(consultas[1]?.sql).not.toMatch(/expira_en\s*[><]/);
    expect(await repo.buscarUltimoPorUsuario('usuario')).toEqual(codigo);
    expect(consultas[2]?.sql).not.toMatch(/usado_en IS NULL|invalidado = 0|expira_en\s*[><]/);
    expect(await repo.registrarIntentoFallido('codigo', 5)).toEqual({
      intentos: 3,
      invalidado: false,
    });
    expect(consultas[3]?.sql).toMatch(
      /SET[\s\S]*OUTPUT INSERTED\.intentos, INSERTED\.invalidado[\s\S]*WHERE[\s\S]*expira_en > SYSUTCDATETIME\(\)/,
    );
    expect(await repo.marcarUsado('codigo')).toBe(true);
    expect(await repo.marcarUsado('codigo')).toBe(false);
    expect(consultas[4]?.sql).toMatch(
      /OUTPUT INSERTED\.uuid[\s\S]*WHERE uuid = @uuid AND usado_en IS NULL AND invalidado = 0 AND expira_en > SYSUTCDATETIME\(\)/,
    );
    await repo.invalidar('codigo');
    expect(consultas[6]?.sql).toContain('invalidado = 1');
  });
});

interface PeticionFalsa {
  input: () => PeticionFalsa;
  query: () => Promise<{ recordset: unknown[] }>;
}

describe('repositorio de catalogos', () => {
  it('lista los roles y mapea el area de servicio', async () => {
    const { pool, consultas } = crearPoolFalso([
      [{ codigo: 1, nombre: 'Medico General', area_servicio: 'Urgencias' }],
    ]);
    expect(await createCatalogoRepository(pool).listarRoles()).toEqual([
      { codigo: 1, nombre: 'Medico General', areaServicio: 'Urgencias' },
    ]);
    expect(consultas[0]?.sql).toContain('dbo.catalogo_rol');
  });

  it('lista los departamentos ordenados', async () => {
    const { pool, consultas } = crearPoolFalso([[{ codigo: '05', nombre: 'ANTIOQUIA' }]]);
    const departamentos = await createCatalogoRepository(pool).listarDepartamentos();
    expect(departamentos).toEqual([{ codigo: '05', nombre: 'ANTIOQUIA' }]);
    expect(consultas[0]?.sql).toContain('ORDER BY codigo');
  });

  it('parametriza el filtro de municipios y mapea el departamento', async () => {
    const fila = { codigo: '76001', nombre: 'CALI', codigo_departamento: '76' };
    const { pool, consultas } = crearPoolFalso([[fila], [fila]]);
    const repo = createCatalogoRepository(pool);
    const valor = "76' OR 1=1";
    expect(await repo.listarMunicipios(valor)).toEqual([
      { codigo: '76001', nombre: 'CALI', codigoDepartamento: '76' },
    ]);
    comprobarConsulta(
      consultas[0],
      'dbo.catalogo_municipio',
      'WHERE codigo_departamento = @codigoDepartamento',
      'codigoDepartamento',
      valor,
    );
    await repo.listarMunicipios();
    expect(consultas[1]?.sql).not.toContain('WHERE');
  });
});

describe('filtro de alcances de la API Key', () => {
  it('conserva todos los alcances validos', async () => {
    const fila = {
      uuid: 'uuid-clave',
      key_hash: 'c'.repeat(64),
      nombre: 'App movil',
      tipo_cliente: 'mobile',
      permisos:
        'auth:register,auth:login,auth:confirm-email,auth:refresh,auth:logout,auth:me,catalog:read',
      revocado: false,
      fecha_creacion: new Date(),
      fecha_modificacion: new Date(),
      ultimo_uso: null,
    };

    const request = (): PeticionFalsa => ({
      input: () => request(),
      query: async () => ({ recordset: [fila] }),
    });
    const pool = { request } as unknown as Database;
    const repo = createApiKeyRepository(pool);

    const apiKey = await repo.findByHash('c'.repeat(64));

    expect(apiKey?.permisos).toHaveLength(7);
    expect(apiKey?.permisos).toContain('auth:me');
  });

  it('descarta los alcances que no existen', async () => {
    const fila = {
      uuid: 'uuid-clave',
      key_hash: 'c'.repeat(64),
      nombre: 'App movil',
      tipo_cliente: 'mobile',
      permisos: 'auth:login,alcance-inexistente',
      revocado: false,
      fecha_creacion: new Date(),
      fecha_modificacion: new Date(),
      ultimo_uso: null,
    };

    const request = (): PeticionFalsa => ({
      input: () => request(),
      query: async () => ({ recordset: [fila] }),
    });
    const pool = { request } as unknown as Database;
    const repo = createApiKeyRepository(pool);

    const apiKey = await repo.findByHash('c'.repeat(64));

    expect(apiKey?.permisos).toEqual(['auth:login']);
  });
});
