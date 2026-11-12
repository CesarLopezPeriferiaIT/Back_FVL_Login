/**
 * Aplica los scripts de esquema de db/init contra la base de datos configurada.
 *
 * Todo el DDL vive en archivos .sql: este script no contiene sentencias de creacion, solo las lee
 * y las envia al servidor. El archivo 00-create-database.sql es el unico que se ejecuta contra la
 * base de sistema master, y su variable $(DB_NAME) se sustituye por el valor de DB_DATABASE.
 *
 * Si la base de datos todavia no existe, se crea de forma idempotente. En los ambientes de
 * calidad y produccion la base la crea el administrador de bases de datos y el rol de la
 * aplicacion solo necesita permisos de lectura y escritura sobre ella, por lo que alli el script
 * nunca intenta crearla.
 *
 * Los scripts se ejecutan en orden alfabetico y cada bloque separado por GO se envia como un
 * lote independiente, de modo que los archivos pueden reutilizarse con sqlcmd.
 *
 * @author Andrés Mora <nelsonmora@periferia-it.com>
 * @version 1.0.0
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import type { IRecordSet } from 'mssql';
import { loadConfig } from '../src/config/env.js';
import type { AppConfig } from '../src/config/env.js';
import { closePool, createPool } from '../src/infrastructure/database/pool.js';
import type { Database } from '../src/infrastructure/database/pool.js';

const SCHEMA_DIR = path.resolve(process.cwd(), 'db', 'init');
const BASE_DE_SISTEMA = 'master';

/** Script que crea la base de datos y que se ejecuta contra master. */
const ARCHIVO_CREACION_BASE = '00-create-database.sql';

/** Variable que el script de creacion de base de datos espera sustituir. */
const VARIABLE_NOMBRE_BASE = '$(DB_NAME)';

/**
 * Formato admitido para el nombre de la base. El nombre se interpola en una sentencia DDL que no
 * admite parametros, por lo que se valida antes de usarlo.
 */
const NOMBRE_BASE_SEGURO = /^[A-Za-z0-9_]{1,128}$/;

/** Intentos de conexion tras crear la base, porque puede tardar un instante en quedar disponible. */
const INTENTOS_DE_CONEXION = 5;

/** Espera entre intentos de conexion, en milisegundos. */
const ESPERA_ENTRE_INTENTOS_MS = 1000;

const listarScripts = async (): Promise<string[]> => {
  const entradas = await readdir(SCHEMA_DIR);
  return entradas.filter((entrada) => entrada.endsWith('.sql')).sort();
};

const dividirEnLotes = (contenido: string): string[] =>
  contenido
    .split(/^\s*GO\s*$/gim)
    .map((lote) => lote.trim())
    .filter((lote) => lote.length > 0);

/**
 * Envia un script al servidor, lote por lote.
 */
const aplicarScript = async (pool: Database, archivo: string, contenido: string): Promise<void> => {
  for (const lote of dividirEnLotes(contenido)) {
    await pool.request().batch(lote);
  }
  process.stdout.write(`Esquema aplicado: ${archivo}\n`);
};

const esperar = async (milisegundos: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, milisegundos));

/**
 * Crea la base de datos si no existe, ejecutando el script que la define.
 */
const crearBaseSiNoExiste = async (config: AppConfig): Promise<void> => {
  if (!NOMBRE_BASE_SEGURO.test(config.db.database)) {
    throw new Error(`El nombre de la base de datos no es valido: ${config.db.database}`);
  }

  const contenido = await readFile(path.join(SCHEMA_DIR, ARCHIVO_CREACION_BASE), 'utf8');
  const conNombre = contenido.split(VARIABLE_NOMBRE_BASE).join(config.db.database);

  const poolMaestro = await createPool(config, BASE_DE_SISTEMA);
  try {
    for (const lote of dividirEnLotes(conNombre)) {
      await poolMaestro.request().batch(lote);
    }
  } finally {
    await closePool(poolMaestro);
  }
};

/**
 * Intenta abrir una conexion a la base de la aplicacion sin lanzar errores.
 *
 * @returns Si la conexion fue posible y el motivo del fallo cuando no lo fue.
 */
const intentarConectar = async (
  config: AppConfig,
): Promise<{ conectada: boolean; motivo: string }> => {
  try {
    const pool = await createPool(config);
    await closePool(pool);
    return { conectada: true, motivo: '' };
  } catch (error) {
    return { conectada: false, motivo: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Comprueba que la base de datos existe y, si falta, la crea. La conexion se reintenta porque una
 * base recien creada puede tardar un instante en quedar disponible para nuevas conexiones.
 */
const asegurarBaseDeDatos = async (config: AppConfig): Promise<void> => {
  const conexion = await intentarConectar(config);
  if (conexion.conectada) {
    return;
  }

  // Un fallo de conexion no significa que la base falte: se consulta el catalogo del servidor
  // para distinguir un problema de conectividad o de permisos de una base que aun no existe.
  let existe = false;
  let motivoDeConsulta: string | null = null;

  try {
    existe = await baseDeDatosExiste(config);
  } catch (error) {
    motivoDeConsulta = error instanceof Error ? error.message : String(error);
  }

  if (motivoDeConsulta !== null) {
    throw new Error(
      `No se pudo verificar si la base de datos ${config.db.database} existe: ${motivoDeConsulta}. ` +
        `Error original al conectar: ${conexion.motivo}`,
      { cause: new Error(conexion.motivo) },
    );
  }

  if (existe) {
    throw new Error(
      `La base de datos ${config.db.database} existe pero no se pudo conectar: ${conexion.motivo}. ` +
        `Revise el tiempo de espera de conexion, las credenciales, los permisos y la conectividad.`,
      { cause: new Error(conexion.motivo) },
    );
  }

  try {
    await crearBaseSiNoExiste(config);
  } catch (error) {
    throw new Error(
      `No fue posible crear la base de datos ${config.db.database}: ${String(error)}. ` +
        `Error original al conectar: ${conexion.motivo}`,
      { cause: error },
    );
  }

  process.stdout.write(`Base de datos creada: ${config.db.database}\n`);

  for (let intento = 1; intento <= INTENTOS_DE_CONEXION; intento += 1) {
    const reintento = await intentarConectar(config);
    if (reintento.conectada) {
      return;
    }
    if (intento === INTENTOS_DE_CONEXION) {
      throw new Error(
        `La base de datos ${config.db.database} se creo pero no acepta conexiones: ${reintento.motivo}`,
        { cause: new Error(reintento.motivo) },
      );
    }
    await esperar(ESPERA_ENTRE_INTENTOS_MS);
  }
};

/**
 * Verifica si una base de datos existe consultando el catalogo del servidor.
 */
const baseDeDatosExiste = async (config: AppConfig): Promise<boolean> => {
  const poolMaestro = await createPool(config, BASE_DE_SISTEMA);
  try {
    const resultado = await poolMaestro
      .request()
      .input('nombre', sql.NVarChar(128), config.db.database)
      .query<IRecordSet<{ existe: number }>>(
        'SELECT CASE WHEN DB_ID(@nombre) IS NULL THEN 0 ELSE 1 END AS existe',
      );
    return Number(resultado.recordset[0]?.existe ?? 0) === 1;
  } finally {
    await closePool(poolMaestro);
  }
};

const main = async (): Promise<void> => {
  const config = loadConfig();
  await asegurarBaseDeDatos(config);

  const pool = await createPool(config);
  try {
    for (const archivo of await listarScripts()) {
      if (archivo === ARCHIVO_CREACION_BASE) {
        continue;
      }
      const contenido = await readFile(path.join(SCHEMA_DIR, archivo), 'utf8');
      await aplicarScript(pool, archivo, contenido);
    }
  } finally {
    await closePool(pool);
  }

  const existe = await baseDeDatosExiste(config);
  process.stdout.write(`Base de datos verificada: ${config.db.database} (existe: ${existe})\n`);
};

main().catch((error: unknown) => {
  process.stderr.write(`No fue posible aplicar el esquema: ${String(error)}\n`);
  process.exitCode = 1;
});
