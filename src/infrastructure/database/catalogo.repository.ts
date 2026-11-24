/**
 * Repositorio de solo lectura de los catalogos: departamentos, municipios y roles.
 *
 * @author Jose Calpa <jose20calpa93@gmail.com>
 * @version 1.0.0
 */
import sql from 'mssql';
import type { IRecordSet } from 'mssql';
import type { Departamento, Municipio, Rol } from '../../domain/entities.js';
import type { CatalogoRepository } from '../../domain/ports.js';
import type { Database } from './pool.js';

interface MunicipioRow {
  codigo: string;
  nombre: string;
  codigo_departamento: string;
}

interface RolRow {
  codigo: number;
  nombre: string;
  area_servicio: string;
}

const SELECT_MUNICIPIO = `
  SELECT codigo, nombre, codigo_departamento
  FROM dbo.catalogo_municipio`;

/**
 * Crea el repositorio de catalogos respaldado por el pool de conexiones indicado.
 */
export const createCatalogoRepository = (pool: Database): CatalogoRepository => ({
  listarRoles: async (): Promise<Rol[]> => {
    const result = await pool
      .request()
      .query<IRecordSet<RolRow>>(
        'SELECT codigo, nombre, area_servicio FROM dbo.catalogo_rol ORDER BY codigo',
      );
    return result.recordset.map((fila) => ({
      codigo: fila.codigo,
      nombre: fila.nombre,
      areaServicio: fila.area_servicio,
    }));
  },

  listarDepartamentos: async (): Promise<Departamento[]> => {
    const result = await pool
      .request()
      .query<IRecordSet<Departamento>>(
        'SELECT codigo, nombre FROM dbo.catalogo_departamento ORDER BY codigo',
      );
    return result.recordset.map(({ codigo, nombre }) => ({ codigo, nombre }));
  },

  listarMunicipios: async (codigoDepartamento?: string): Promise<Municipio[]> => {
    const peticion = pool.request();
    if (codigoDepartamento !== undefined) {
      peticion.input('codigoDepartamento', sql.VarChar(2), codigoDepartamento);
    }
    const filtro =
      codigoDepartamento === undefined ? '' : ' WHERE codigo_departamento = @codigoDepartamento';
    const result = await peticion.query<IRecordSet<MunicipioRow>>(
      `${SELECT_MUNICIPIO}${filtro} ORDER BY codigo`,
    );
    return result.recordset.map((fila) => ({
      codigo: fila.codigo,
      nombre: fila.nombre,
      codigoDepartamento: fila.codigo_departamento,
    }));
  },
});
