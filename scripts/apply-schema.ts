/**
 * Aplica los scripts de esquema de db/init contra la base de datos configurada.
 *
 * Los scripts se ejecutan en orden alfabetico y cada bloque separado por GO se envia como un
 * lote independiente, de modo que los archivos pueden reutilizarse con sqlcmd.
 *
 * @author Javier Murcia <javier.murcia.ro@fvl.org.co>
 * @version 1.0.0
 */
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../src/config/env.js';
import { closePool, createPool } from '../src/infrastructure/database/pool.js';

const SCHEMA_DIR = path.resolve(process.cwd(), 'db', 'init');

const listarScripts = async (): Promise<string[]> => {
  const entradas = await readdir(SCHEMA_DIR);
  return entradas.filter((entrada) => entrada.endsWith('.sql')).sort();
};

const dividirEnLotes = (contenido: string): string[] =>
  contenido
    .split(/^\s*GO\s*$/gim)
    .map((lote) => lote.trim())
    .filter((lote) => lote.length > 0);

const main = async (): Promise<void> => {
  const config = loadConfig();
  const pool = await createPool(config);

  try {
    for (const archivo of await listarScripts()) {
      const contenido = await readFile(path.join(SCHEMA_DIR, archivo), 'utf8');
      for (const lote of dividirEnLotes(contenido)) {
        await pool.request().batch(lote);
      }
      process.stdout.write(`Esquema aplicado: ${archivo}\n`);
    }
  } finally {
    await closePool(pool);
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`No fue posible aplicar el esquema: ${String(error)}\n`);
  process.exitCode = 1;
});
