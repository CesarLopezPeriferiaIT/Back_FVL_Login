# Microservicio de login - Fundacion Valle del Lili

Microservicio REST en **Express + TypeScript** para el **registro de cuentas**, la **confirmacion de
correo electronico** y el **inicio de sesion** de las aplicaciones de la Fundacion Valle del Lili.
La informacion persiste en **SQL Server**.

El proyecto sigue los _Lineamientos Desarrollo de Software - Aplicaciones Moviles y Web V1.0.7_ de la
Subdireccion de Informatica.

## Documentacion

| Artefacto                             | Ubicacion                         |
| ------------------------------------- | --------------------------------- |
| Especificacion funcional y técnica    | `odd/tasks/login-microservice.md` |
| Guia de consumo de la API             | `docs/api-guide.html`             |
| Registro de cambios                   | `CHANGELOG.md`                    |
| Esquema de base de datos              | `db/init/`                        |
| Configuracion de variables de entorno | `env.example` (plantilla)         |

## Requisitos

- **Node.js 24 o superior** para el contenedor y para los scripts de `npm`.
- **Bun 1.4 o superior** para el desarrollo local en la maquina del equipo.
- **SQL Server 2019 o superior** (compatible con Azure SQL).
- **Docker** y **Docker Compose** para el despliegue.

## Desarrollo local

```bash
# Instalar dependencias con Bun (entorno de desarrollo local).
bun install

# Copiar la plantilla de variables de entorno y ajustar los valores.
# La plantilla se versiona; el archivo .env con valores reales nunca se versiona.
cp env.example .env

# Levantar SQL Server y el servicio.
docker compose up -d

# Aplicar el esquema (crea las tablas si no existen).
bun run db:init

# Ejecutar en modo vigilancia.
bun run dev
```

## Verificacion

```bash
bun run typecheck   # TypeScript estricto
bun run lint        # ESLint
bun run format:check # Prettier
bun run test:coverage # Vitest con cobertura minima de 80 %
```

## Convenciones

- Rutas bajo el prefijo `/backend/{ambiente}/v{version}/`, con ambientes `dev`, `qas` y `prd`.
- Respuesta estandar: `{ message, error, code, data }`.
- TypeScript estricto sin `any`; en la frontera de entrada se usa `unknown` y se reduce por validacion.
- Programacion funcional; sin estado mutable compartido.
- Todo archivo abre con un bloque JSDoc con descripcion en ingles, `@author` y `@version`.

## Estado y pendientes

Consulte la seccion _Pendientes_ de `CHANGELOG.md` para las funcionalidades identificadas en los
lineamientos y que aun no hacen parte de esta version.
