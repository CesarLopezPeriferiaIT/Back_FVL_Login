# Microservicio de registro e inicio de sesion (login)

Microservicio REST en Express + TypeScript para registro de cuentas, confirmacion de correo e
inicio de sesion, conforme a los "Lineamientos Desarrollo de Software - Aplicaciones Moviles y
Web V1.0.7" de la Fundacion Valle del Lili. Persistencia en SQL Server.

## Specs

### S1

> vamos a hacer un microservicio con express siguiendo los lineamientos de desarrollo expuestos en el PDF "E:\trabajo\Villa\lineamientos_desarrollo_aplicaciones_moviles_web_V1_0_7.pdf".

### S2

> En mi máquina use bun para la instalación, pero para las imágenes de docker si use lo que dice el PDF exige.

### S3

> Este microservicio es de registro de cuenta e inicio de sesión nada más.

### S4

> La base de datos va a ser SQL SERVER, con esto en cuenta y con las siguientes tablas cree el microservicio.
> Tablas:
>
> ```
> Tabla de usuario:
> uuid
> Email
> pass _ hash
> estado (Char) A activo - I inactivo - C por confirmar(defecto) - D desactivado (intentos errados)
> fecha creación
> fecha modificación
> tyc (bool)
>
> Tabla de LogSession:
> uuid
> uuid del usuario
> successful (bool)
> timestamp del intento
> ```

### S5

> Pregunteme todo lo que no se pueda deducir o falte la información.

### S6 - Estado inicial de la cuenta (respuesta del usuario)

> Registro deja la cuenta Por confirmar (C)

### S7 - Estrategia de sesion (respuesta del usuario)

> JWT de acceso + refresh rotativo

### S8 - Limite de intentos (respuesta del usuario)

> 10 intentos y desactivación permanente (D)

### S9 - Log de intentos (respuesta del usuario)

> No registrar intentos de usuarios inexistentes

### S10 - Envio de correo (respuesta del usuario)

> SMTP configurable (nodemailer)

### S11 - Token de confirmacion de correo (respuesta del usuario)

> JWT firmado, sin tabla nueva

### S12 - Refresh token (respuesta del usuario)

> en la tabla "LogSession" complete los campos necesarios para lo de JWT

### S13 - API Key institucional (respuesta del usuario)

> Sí, con tabla ApiKey

### S14 - Flujo movil (respuesta del usuario)

> Login propio + refresh

### S15 - CAPTCHA (respuesta del usuario)

> No implementarlo ahora

### S16 - Politica de contrasenas (respuesta del usuario)

> 8-72, letra + número

### S17 - Imagen Docker y gestor de paquetes (respuesta del usuario)

> node:24-alpine + npm ci

### S18 - Algoritmo de hash (respuesta del usuario)

> argon2id (@node-rs/argon2)

### S19 - Esquema de base de datos (respuesta del usuario)

> Creo solo las tablas

### S20 - Endpoints adicionales (respuesta del usuario)

> Confirmar correo, refresh y logout
> Recuperar y cambiar contraseña
> Consultar perfil (me)
> Desbloqueo administrativo

### S21 - Terminos y condiciones (respuesta del usuario)

> Lo de TyC es que la persona acepta los términos y condiciones que debe leer antes de crear un nuevo
> usuario, si el usuario no aceptó eso aunque de alguna forma haya saltado esa pantalla, llenado el
> formulario de creación y enviado esa información no envía el correo de confirmación para evitar
> registros incompletos.

### S22 - Contador de intentos fallidos (respuesta del usuario)

> Contar desde LogSession

### S23 - Desbloqueo de cuentas en estado D (respuesta del usuario)

> de momento solo se puede cambiar por base de datos, deje documentado que esto falta

### S24 - Requisitos del PDF aplicables al backend

Extraidos del PDF V1.0.7 y de obligatorio cumplimiento:

- **1.2 Stack**: TypeScript estricto sin `any`, programacion funcional, SOLID/DRY/KISS/YAGNI,
  arquitectura modular con separacion de responsabilidades, linter y formatter.
- **1.2.3 Backend**: Node.js, Dockerizacion obligatoria del backend, documentacion de API
  obligatoria siguiendo `docs/api-guide.html` con el formato estandar de respuesta
  `message`, `error`, `code`, `data`.
- **1.2.4 Base de datos**: SQL Server, con rol de acceso propio para la aplicacion, distinto de la
  cuenta de administrador, separando permisos de lectura y escritura.
- **1.2.5 Comunicacion**: APIs RESTful, JSON, rutas en ingles separadas por guiones medios, prefijo
  `/backend/{ambiente}/v{version}/` con ambientes `dev`, `qas`, `prd`.
- **1.4 Rendimiento**: tiempos de carga por debajo de 1 segundo en interacciones internas.
- **1.5.1 Proteccion de datos**: HTTPS/TLS 1.2 o superior; prohibido almacenar credenciales, tokens
  o informacion sensible en texto plano; configuracion sensible por variables de entorno y nunca en
  el codigo fuente; los secretos no entran a la imagen Docker y el Dockerfile nunca copia el `.env`;
  `.dockerignore` excluye como minimo `.env`, `**/*.key`, `**/*.pem`, volumenes, `node_modules`,
  logs y `.git`; todo `.env`/`.env.example` lleva cada parametro comentado.
- **1.5.2 Identidad del cliente**: CORS solo con lista explicita de origenes, nunca `*` cuando se
  aceptan cookies; endpoints protegidos exigen `X-API-Key` en cada cliente; las claves validas
  viven en la base de datos, no en codigo ni en variables de entorno estaticas; se guarda solo el
  hash SHA-256 de la clave y en los logs se identifica por sus primeros 8 caracteres.
- **1.5.5 Cabeceras HTTP de seguridad**: configuradas en Node con `helmet`, montadas antes que
  cualquier ruta; CSP `default-src 'none'; frame-ancestors 'none'` para API JSON;
  `X-Content-Type-Options: nosniff`; `X-Frame-Options: deny`; `Referrer-Policy: no-referrer`;
  `Strict-Transport-Security: max-age=63072000; includeSubDomains`; `Cross-Origin-Opener-Policy:
same-origin`; `Cross-Origin-Embedder-Policy: require-corp`; `Cross-Origin-Resource-Policy:
same-origin`; `Permissions-Policy` restrictivo; `X-DNS-Prefetch-Control: off`;
  `X-Permitted-Cross-Domain-Policies: none`; `Cache-Control: no-store, max-age=0`;
  `Clear-Site-Data` unicamente en la respuesta de cierre de sesion; eliminar `X-Powered-By` y
  `Server` con version.
- **1.5.6 TLS y nginx**: `ssl_protocols TLSv1.2 TLSv1.3`, `server_tokens off`.
- **1.5.4 Sesiones**: control de sesiones con tiempos de expiracion definidos y restriccion del
  numero de intentos de autenticacion contra fuerza bruta.
- **1.6.4 Limites de intentos**: combinar limite por identificador con umbral mas alto para la IP.
- **1.7 Calidad**: pruebas unitarias obligatorias con cobertura minima del 80 %; Vitest y
  `supertest` para backend; todo cambio debe ser revisado y aprobado por otro miembro del equipo.
- **1.8 Versionado y despliegue**: `MAJOR.MINOR.PATCH`; ramas `main` (produccion) y `develop`
  (integracion); ramas de trabajo `feature/{descripcion}`, `fix/{descripcion}`, `docs/{descripcion}`
  en kebab-case en ingles; mensaje de commit en ingles, en mayusculas, imperativo y sin punto
  final, cuerpo en espanol con vinetas `-` sin espacio, el ultimo bullet reporta resultados de
  validacion y el numero real de pruebas; `CHANGELOG.md` con entradas enlazadas a su tag `v`.
- **3.5 Configuraciones y cifrado**: cabeceras de seguridad desde el codigo de la aplicacion.
- **3.7 Software y configuraciones por defecto**: no dejar configuraciones por defecto.
- **3.8 Protecciones en autenticacion**: contrasenas complejas; CAPTCHA en formularios de login
  (ver S15, fuera de alcance en esta version y documentado como pendiente).
- **4.4 Seguridad acceso y trazabilidad**: usuarios de aplicacion preferiblemente autenticados
  contra LDAP institucional.

## Tasks

| ID  | Specs                                            | Descripcion                                                                                                                                                                                                                            | Ruta   | Commit                                             |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| T1  | S1, S2, S24                                      | Fundacion del proyecto: repo Git con ramas `main`/`develop`/`feature`, `package.json`, `tsconfig` estricto, ESLint, Prettier, Vitest con cobertura 80 %, `.env.example` documentado, `.gitignore`, `.dockerignore`, `README.md`        | inline | `8774947 ADD PROJECT FOUNDATION`                   |
| T2  | S4, S12, S13, S19, S24                           | Capa de datos: `pool` SQL Server, puertos de repositorio, repositorios `Usuario`/`LogSession`/`ApiKey` y scripts idempotentes `db/init/*.sql`                                                                                          | inline | `fc1353e ADD DATABASE LAYER AND SCHEMA SCRIPTS`    |
| T3  | S6, S7, S8, S10, S11, S16, S17, S18, S22         | Dominio: `password-hasher` (argon2id), `token-service` (JWT acceso, confirmacion y reseteo), `api-key-service`, `mail-service`, `auth-service` con estados A/I/C/D y limite de 10 intentos                                             | inline | `b023e58 ADD DOMAIN SERVICES`                      |
| T4  | S24                                              | Capa HTTP: `helmet` con las cabeceras del PDF, CORS por lista explicita, rate limiting por identificador e IP, middleware `X-API-Key`, middleware JWT, manejador de errores y presentador de respuesta `message`/`error`/`code`/`data` | worker | `7ff1305 ADD HTTP MIDDLEWARE AND SECURITY HEADERS` |
| T5  | S3, S6, S7, S8, S9, S11, S16, S20, S21, S22, S23 | Endpoints de autenticacion: `register`, `login`, `confirm-email`, `refresh`, `logout`, `forgot-password`, `reset-password`, `change-password`, `me`                                                                                    | worker | `c6de8c2 ADD AUTH ENDPOINTS`                       |
| T6  | S13, S24                                         | Endpoint publico de registro de instalacion con permisos por tipo de cliente y gestion de `ApiKey`                                                                                                                                     | worker | `c6de8c2 ADD AUTH ENDPOINTS`                       |
| T7  | S24                                              | Suite automatizada: unitarias de dominio e integracion HTTP con `supertest`, cobertura minima 80 %                                                                                                                                     | inline | `84f4c64 ADD DOMAIN TEST SUITE`                    |
| T8  | S2, S17, S24                                     | Artefactos de despliegue: `Dockerfile` multi-etapa `node:24-alpine` con `npm ci`, `docker-compose.yml` con SQL Server, `nginx` de referencia con TLS, healthcheck                                                                      | worker | `e852418 ADD DOCKER DEPLOYMENT ARTIFACTS`          |
| T9  | S15, S23, S24                                    | Documentacion: `docs/api-guide.html`, `CHANGELOG.md`, guia de operacion, pendientes (CAPTCHA, desbloqueo administrativo, OAuth PKCE, LDAP)                                                                                             | inline | `7785b23 ADD API DOCUMENTATION AND CHANGELOG`      |
| T10 | S24                                              | Documentacion interactiva: Swagger UI en `/api-docs` y documento OpenAPI 3.1 en `/api-docs.json`, con los cuerpos de peticion derivados de los validadores zod                                                                         | inline | `pendiente`                                        |
| T11 | S24                                              | Documentacion del consumo desde la aplicacion movil: diagramas de secuencia, diagrama de estados de la cuenta y tablas de referencia de endpoints, limites y codigos de error                                                          | worker | `pendiente`|

## Log

- L1 (2026-11-11) - Peticion original del usuario:
  > vamos a hacer un microservicio con express siguiendo los lineamientos de desarrollo expuestos en el PDF "E:\trabajo\Villa\lineamientos_desarrollo_aplicaciones_moviles_web_V1_0_7.pdf".
  > En mi máquina use bun para la instalación, pero para las imágenes de docker si use lo que dice el PDF exige.
  > Este microservicio es de registro de cuenta e inicio de sesión nada más.
  > La base de datos va a ser SQL SERVER, con esto en cuenta y con las siguientes tablas cree el microservicio.
  > Tablas:
  >
  > ```
  > Tabla de usuario:
  > uuid
  > Email
  > pass _ hash
  > estado (Char) A activo - I inactivo - C por confirmar(defecto) - D desactivado (intentos errados)
  > fecha creación
  > fecha modificación
  > tyc (bool)
  >
  > Tabla de LogSession:
  > uuid
  > uuid del usuario
  > successful (bool)
  > timestamp del intento
  > ```
  >
  > Pregunteme todo lo que no se pueda deducir o falte la información.
- L2 (2026-11-11) - Decisiones tomadas en la fase de aclaracion: S6 a S23. El usuario respondio 18
  preguntas sobre estado inicial, tokens, limites de intentos, log de intentos, correo, tokens de
  confirmacion y refresh, API Key, flujo movil, CAPTCHA, politica de contrasenas, imagen Docker,
  hash, esquema de base de datos, endpoints, terminos y condiciones, contador de intentos y
  desbloqueo administrativo.
- L3 (2026-11-11) - Nota de alcance: el desbloqueo administrativo de cuentas en estado D no se
  implementa como endpoint; se documenta como procedimiento manual sobre la base de datos junto con
  el script `db/scripts/unlock-user.sql`. CAPTCHA (3.8) y OAuth 2.0 con PKCE (1.6.3) quedan
  documentados como pendientes.
- L4 (2026-11-11) - Decisiones tomadas durante la implementacion, con el fin de cerrar huecos del
  contrato que el PDF no resuelve:
  - El enlace de reseteo de contrasena lleva dentro una huella de la contrasena vigente. Asi el
    enlace es de un solo uso sin necesidad de una tabla adicional de tokens consumidos, y el
    endpoint `GET /auth/reset-password` puede distinguir un enlace ya utilizado de uno vigente.
  - Un enlace de correo invalido, expirado o ya usado responde 400, porque el dato recibido en la
    peticion no es valido. Un token de acceso invalido responde 401, porque el cliente no esta
    autenticado.
  - El transporte de correo de consola, que imprime el cuerpo del mensaje con el token de un solo
    uso, solo se admite en el ambiente `dev`. La configuracion falla de forma explicita si se
    intenta usar en `qas` o `prd`.
  - La plantilla de variables de entorno se versiona como `.env.example`. El archivo `.env` con
    valores reales nunca se versiona. El PDF acepta cualquier nombre de plantilla siempre que cada
    parametro este comentado.
  - El limite de intentos por identificador y por direccion IP se configura por variable de
    entorno, con umbral mayor para la IP, conforme a la recomendacion 1.6.4.
- L5 (2026-11-11) - Estado al cierre de la implementacion: cuatro work units committeados por el
  orquestador y tres entregados por workers, revisados y corregidos por el orquestador. El cambio
  de estado HTTP de los tokens de enlace lo ajusto el orquestador tras la revision del worker, que
  lo reporto como discrepancia.
- L6 (2026-11-11) - Evidencia de verificacion:
  - `bun run typecheck` sin errores y `bun run lint` sin hallazgos.
  - 96 pruebas automatizadas en verde con Vitest y supertest. Cobertura de 96.62 % de sentencias,
    86.74 % de ramas, 99.28 % de funciones y 96.84 % de lineas, por encima del minimo del 80 %.
  - Construccion de la imagen verificada con `docker build` sobre `node:24-alpine`.
  - Verificacion extremo a extremo contra un SQL Server 2022 real en contenedor: registro de
    instalacion, registro de cuenta en estado `C`, confirmacion de correo a estado `A`, inicio de
    sesion con token de acceso y refresh, renovacion con rotacion, consulta del perfil y cierre de
    sesion con la cabecera `Clear-Site-Data`. Las once cabeceras de seguridad del PDF se
    comprobaron sobre la respuesta real del servicio.
  - El esquema se aplico sobre la base real y se verificaron las tres tablas con sus columnas,
    sus indices de unicidad y la restriccion de estado.
  - La revision nativa por riderecha se evaluo con tier alto, pero el consentimiento para este
    candidato quedo denegado en el host y no se creo linaje. La revision es una mirada externa y
    nunca sustituye la verificacion ni autoriza la entrega.
  - La construccion de la imagen y el arranque en modo healthcheck quedaron verificados con el
    demonio de Docker disponible en el equipo de desarrollo.
- L7 (2026-11-11) - Cambio de autoria a solicitud del usuario: el bloque JSDoc de los 53 archivos
  versionados y la identidad de Git pasan a `Andrés Mora <nelsonmora@periferia-it.com>`. Se
  reescribio la autoria de los commits de la rama, que es una rama local sin remoto ni fusiones;
  el diff de contenido entre el respaldo y la rama reescrita quedo vacio, lo que demuestra que
  solo cambio la autoria y no el codigo. Las referencias de commit de la tabla de tareas se
  actualizaron a los nuevos identificadores.
- L8 (2026-11-11) - Creacion de la base de datos por codigo, a solicitud del usuario: el script
  `db:init` verifica primero si la base existe y, cuando falta, se conecta a `master` y la crea
  de forma idempotente antes de aplicar el esquema. El nombre se valida contra un formato estricto
  porque se interpola en una sentencia `CREATE DATABASE`, que no admite parametros. En calidad y
  produccion la base la crea el administrador de bases de datos y el rol de la aplicacion solo
  necesita permisos de lectura y escritura, por lo que alli el script nunca intenta crearla.
  Verificado con tres ejecuciones consecutivas sobre un SQL Server recien creado: la primera creo
  la base y aplico el esquema, las dos siguientes no recrearon nada y dejaron una sola copia de
  cada tabla. El flujo completo de la API se valido de nuevo contra esa base.
- L9 (2026-11-11) - Documentacion interactiva a solicitud del usuario:
  - El servicio publica la interfaz Swagger UI en `/api-docs` y el documento OpenAPI 3.1 en
    `/api-docs.json`. Los cuerpos de las peticiones se derivan de los mismos validadores `zod` que
    validan el trafico en tiempo de ejecucion, con `z.toJSONSchema`, de modo que la documentacion
    no puede desincronizarse de lo que el servicio acepta.
  - La interfaz tiene su propia politica de seguridad de contenido, que permite sus scripts y
    estilos propios y mantiene la prohibicion de ser embebida en marcos. El resto de la API
    conserva la politica estricta que solo admite JSON.
  - Los recursos de la interfaz se sirven desde la instalacion local de `swagger-ui-dist`, nunca
    desde un CDN de terceros.
  - Se corrigieron cinco referencias al nombre de la plantilla de variables de entorno que
    quedaron mal compuestas al renombrarla: dos de ellas ya estaban publicadas en la rama
    remota. El archivo en disco siempre tuvo el nombre correcto; solo el texto de la documentacion
    era incorrecto.
  - El `Dockerfile` ahora instala con `--ignore-scripts`. Ningun binario nativo del proyecto lo
    necesita y una de las dependencias de produccion ejecuta telemetria saliente desde su
    `postinstall`. Se verifico que argon2id sigue funcionando en el contenedor con esa opcion.
  - Al agregar dependencias con Bun, el `package-lock.json` de npm quedo desincronizado y la
    construccion de la imagen fallo en `npm ci`. Se regenero el lockfile de npm, que es el que usa
    la imagen.
- L10 (2026-11-11) - Documentacion del consumo desde la aplicacion movil, a solicitud del
  usuario: documento con diagramas de secuencia Mermaid que recorren el primer arranque de la app
  (registro de la instalacion y obtencion de la API Key), el registro y la confirmacion de correo
  con la bifurcacion de los terminos, el ciclo de inicio de sesion con renovacion rotativa y cierre,
  y la recuperacion y el cambio de contrasena. Incluye el diagrama de estados de la cuenta, tablas
  de referencia de endpoints, limites y codigos de error, y las reglas que la app movil debe
  cumplir para guardar las credenciales en el almacen seguro del dispositivo.
