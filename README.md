# Microservicio de login - Fundacion Valle del Lili

Microservicio REST en **Express + TypeScript** para el **registro de cuentas**, la **confirmacion de
correo electronico** y el **inicio de sesion** de las aplicaciones de la Fundacion Valle del Lili.
La informacion persiste en **SQL Server**.

El proyecto sigue los _Lineamientos Desarrollo de Software - Aplicaciones Moviles y Web V1.0.7_ de la
Subdireccion de Informatica.

## Documentacion

| Artefacto                              | Ubicacion                                  |
| -------------------------------------- | ------------------------------------------ |
| Especificacion funcional y técnica     | `odd/tasks/login-microservice.md`          |
| Guia de consumo de la API              | `docs/api-guide.html`                      |
| Consumo desde la app movil             | `docs/flujo-aplicacion-movil.md`           |
| Documentacion interactiva (Swagger UI) | `/api-docs` del servicio en ejecucion      |
| Documento OpenAPI 3.1                  | `/api-docs.json` del servicio en ejecucion |
| Registro de cambios                    | `CHANGELOG.md`                             |
| Esquema de base de datos               | `db/init/`                                 |
| Configuracion de variables de entorno  | `.env.example` (plantilla)                 |

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
cp .env.example .env

# Definir en el archivo .env los secretos que el compose exige de forma explicita:
# JWT_ACCESS_SECRET, JWT_CONFIRM_SECRET, JWT_RESET_SECRET, DB_USER y DB_PASSWORD.

# Levantar SQL Server y el servicio.
docker compose up -d

# Aplicar el esquema. Si la base de datos FVL_Login todavia no existe, el script la crea de
# forma idempotente y despues aplica las tablas. Volver a ejecutarlo no vuelve a crearla.
bun run db:init

# Ejecutar en modo vigilancia.
bun run dev
```

En los ambientes de calidad y produccion la base de datos la crea el administrador de bases de
datos y el rol de la aplicacion solo necesita permisos de lectura y escritura sobre ella. En ese
caso el script nunca intenta crearla y solo aplica el esquema.

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

## Documentacion interactiva

El servicio publica la documentacion de consumo en dos formatos:

- **`/api-docs`**: interfaz interactiva (Swagger UI) con ejecucion de peticiones desde el navegador.
- **`/api-docs.json`**: documento OpenAPI 3.1, para importarlo en Postman, Insomnia o en la
  generacion automatica de clientes.

Los cuerpos de las peticiones que muestra la documentacion se derivan de los mismos validadores
`zod` que validan el trafico en tiempo de ejecucion, de modo que la documentacion no puede
desincronizarse de lo que el servicio realmente acepta.

Los recursos de la interfaz se sirven desde la instalacion local de `swagger-ui-dist`, nunca desde
un CDN de terceros. La interfaz tiene su propia politica de seguridad de contenido, que permite sus
scripts y estilos y mantiene la prohibicion de ser embebida en marcos; el resto de la API sigue con
la politica estricta que solo admite JSON. Si la politica institucional exige que la documentacion
no sea alcanzable desde la red, se puede restringir la ruta en el `nginx` de referencia.

## Estado y pendientes

Consulte la seccion _Pendientes_ de `CHANGELOG.md` para las funcionalidades identificadas en los
lineamientos y que aun no hacen parte de esta version.
