# Inicio de sesion con codigo OTP de 6 digitos

Reemplaza el inicio de sesion con contrasena por un flujo de codigo OTP de 6 digitos enviado por correo
electronico. El registro ya no guarda contrasena (`db/init/05-usuario-sin-password.sql`), por lo que hoy
`POST /auth/login` falla siempre con `CREDENCIALES_INVALIDAS` y el acceso de los usuarios esta roto.

## Specs

### S1

> ¿al iniciar sesión todavía pide la contraseña?
> Si todavía pide, hay que quitarlo. ya que el cliente pidió que en vez de tener contraseñas hay que usar OPT para iniciar sesión.

### S2

> la respuesta es usar "POST /auth/login" para el email y que responda que se envió el OTP y "POST /auth/login/code" con el email y con el OTP para obtener el JWT (iniciar sesión) correspondiente.

## Decisiones tecnicas

### D1. Contrato HTTP del inicio de sesion

- `POST /auth/login`: API Key con el alcance `auth:login` ya existente (`PERMISOS.authLogin`). No se crea un
  alcance nuevo, para que las API Keys emitidas antes sigan sirviendo. Cuerpo: `{ "email": "..." }`.
  Responde 200 con `data: { "correo_enviado": true }` y el mensaje
  "Si la cuenta esta registrada y activa, te enviamos un codigo de acceso a tu correo electronico.".
- `POST /auth/login/code`: API Key con el alcance `auth:login`. Cuerpo: `{ "email": "...", "codigo": "123456" }`.
  Responde 200 con la misma forma de datos que devuelve hoy el login (token de acceso, token de renovacion,
  expiraciones y usuario publico).
- El cuerpo del login nuevo no acepta `password`: `loginSchema` queda con `email` solamente y se agrega
  `loginCodigoSchema` con `email` y `codigo` de 6 digitos.
- No queda ningun endpoint que reciba contrasena: el endpoint de login con contrasena desaparece.

### D2. Respuestas y errores de `POST /auth/login`

- El correo se normaliza antes de buscar la cuenta.
- La respuesta es IDENTICAL en toda solicitud aceptada: 200 con `data: { "correo_enviado": true }` y el mensaje
  "Si la cuenta esta registrada y activa, te enviamos un codigo de acceso a tu correo electronico.". El valor
  `correo_enviado` es siempre `true` en una solicitud aceptada: no revela si el correo esta registrado ni si el
  envio fallo en el servidor, porque esa diferencia permitiria enumerar las cuentas registradas. El fallo de
  entrega se registra en el servidor con `logger.error` y no se expone al cliente.
- Si la cuenta no existe: no se envia correo y se registra `logger.warn`.
- Cuenta en estado `C`: 403 `CUENTA_POR_CONFIRMAR`. En estado `I`: 403 `CUENTA_INACTIVA`. En estado `D`:
  403 `CUENTA_DESACTIVADA`.
- Limite de frecuencia excedido: 429 `RATE_LIMIT_EXCEDIDO`, con el manejador de errores existente.

### D3. Respuestas y errores de `POST /auth/login/code`

- Codigo vigente y correcto: 200 con los tokens de la sesion.
- No hay codigo emitido para ese correo: 401 `CODIGO_ACCESO_NO_EXISTE`.
- Codigo vencido: 401 `CODIGO_ACCESO_VENCIDO`.
- Codigo incorrecto: 401 `CODIGO_ACCESO_INVALIDO`.
- Codigo invalidado por superar los intentos: 401 `CODIGO_ACCESO_INVALIDADO`.
- Estados de cuenta: los mismos 403 de D2.
- Cada verificacion fallida cuenta como intento de autenticacion fallido: al llegar a 10 intentos consecutivos la
  cuenta pasa a estado `D` y la respuesta es 403 `CUENTA_DESACTIVADA`. Se conserva el lineamiento 1.6.4 y el
  estado `D` ya documentado. Ademas el codigo se invalida al quinto intento fallido, como en la confirmacion.

### D4. Persistencia: tabla nueva `dbo.codigo_login`

- Archivo nuevo `db/init/06-codigo-login.sql`, con el mismo estilo de `db/init/02-codigo-confirmacion.sql`:
  `SET QUOTED_IDENTIFIER ON`, `SET ANSI_NULLS ON`, bloques idempotentes separados por `GO` y un comentario que
  explique el proposito de la tabla.
- No se altera `dbo.codigo_confirmacion`: esa tabla no tiene columna de proposito y su indice unico filtrado
  impediria tener a la vez un codigo de confirmacion y uno de acceso para la misma cuenta.
- Columnas: `uuid UNIQUEIDENTIFIER NOT NULL` (clave primaria agrupada), `uuid_usuario UNIQUEIDENTIFIER NOT NULL`
  (clave foranea a `dbo.usuario (uuid)`), `codigo_hash NVARCHAR(512) NOT NULL`, `expira_en DATETIME2(3) NOT NULL`,
  `intentos INT NOT NULL` con valor por defecto `0`, `invalidado BIT NOT NULL` con valor por defecto `0`,
  `usado_en DATETIME2(3) NULL`, `fecha_creacion DATETIME2(3) NOT NULL` con valor por defecto `SYSUTCDATETIME()`.
- Indice unico filtrado `UX_codigo_login_usuario` sobre `dbo.codigo_login (uuid_usuario)` con filtro
  `WHERE usado_en IS NULL AND invalidado = 0`, de modo que exista como maximo un codigo no consumido por cuenta.
- Aplicacion: la base desplegada es compartida con otra aplicacion, asi que el archivo se aplica por separado
  con `sqlcmd` antes del despliegue, igual que `02-codigo-confirmacion.sql`. Queda documentado en README y CHANGELOG.

### D5. Repositorio, servicio y configuracion del codigo de acceso

- `src/domain/ports.ts`: puerto nuevo `CodigoLoginRepository`, con los mismos nombres de metodo y las mismas
  formas de argumento y retorno que `CodigoConfirmacionRepository`, con una sola diferencia:
  `marcarUsado(uuid: string): Promise<boolean>` devuelve `true` cuando el codigo se consumio y `false` cuando
  no se consumio (ya usado, invalidado o vencido).
- `src/domain/entities.ts`: entidad nueva `CodigoAcceso`, espejo de `CodigoConfirmacion`, con los mismos campos:
  `uuid`, `uuidUsuario`, `codigoHash`, `expiraEn`, `intentos`, `invalidado` y `usadoEn`.
- `src/infrastructure/database/codigo-login.repository.ts`: espejo de `codigo-confirmacion.repository.ts`:
  - `guardar(codigo)`: inserta el codigo en `dbo.codigo_login`.
  - `buscarNoConsumidoPorUsuario(uuidUsuario)`: devuelve el codigo no consumido (no usado, no invalidado) exista
    o no su vigencia, para poder distinguir "vencio" de "no hay codigo".
  - `buscarUltimoPorUsuario(uuidUsuario)`: ultimo codigo sin filtro de estado, para clasificar el fallo despues
    de invalidar.
  - `registrarIntentoFallido(uuid, maxIntentos)`: incrementa el contador e invalida en una sola sentencia, con
    `OUTPUT` entre `SET` y `WHERE`, y no cuenta intentos de codigos ya vencidos.
  - `marcarUsado(uuid)`: consumo atomico: actualiza solo si el codigo sigue sin usar, sin invalidar y vigente, y
    devuelve si la fila fue actualizada.
  - `invalidar(uuid)`: invalida el codigo indicado. El servicio invalida el codigo anterior con este metodo
    antes de insertar el nuevo, porque el indice filtrado no puede excluir los vencidos.
- `src/domain/codigo-login-service.ts`: espejo de `codigo-confirmacion-service.ts`, con `generar(email)`,
  `validar(email, codigo)`, `marcarUsado(uuidCodigo)` y `clasificarFallo(email)`. El codigo son 6 digitos
  generados con `randomInt(0, 1000000)` rellenados con ceros, con hash argon2id mediante el hasher existente.
- `src/config/env.ts`: `loginCode.ttlMinutes` desde `LOGIN_CODE_TTL_MINUTES` (por defecto 10) y
  `loginCode.maxAttempts` desde `LOGIN_CODE_MAX_ATTEMPTS` (por defecto 5). Limites de frecuencia:
  `RATE_LIMIT_LOGIN_CODE_PER_IDENTIFIER` (por defecto 5) y `RATE_LIMIT_LOGIN_CODE_PER_IP` (por defecto 20).
- `src/http/middlewares/rate-limit.ts`: limitadores nuevos para la solicitud del codigo, con umbral mayor para
  la direccion IP, conforme al lineamiento 1.6.4.

### D6. Correo del codigo de acceso

- `src/domain/mail-service.ts`: metodo `enviarCodigoAcceso(correo, codigo, expiraEn)`.
- `src/infrastructure/mail/templates.ts`: plantilla `plantillaCodigoAcceso`, con asunto "Codigo de acceso" y
  cuerpo en espanol que indica el codigo de 6 digitos y los minutos de vigencia.
- `src/infrastructure/mail/mailer.ts`: implementacion con el transporte de correo existente.

### D7. Servicio de autenticacion

- `src/domain/auth-service.ts`: `solicitarCodigoAcceso({ email })` y `iniciarSesionConCodigo({ email, codigo })`.
- `src/index.ts`: composicion del repositorio y del servicio de codigo de acceso.
- El hasher de argon2 se conserva: pasa a hashear codigos OTP y no contrasenas; se actualiza su JSDoc para
  reflejar el uso nuevo.
- Secuencia de la eliminacion de la contrasena: T4 (U4) incorpora los dos metodos nuevos y CONSERVA
  `iniciarSesion({ email, password })` y la dependencia `hasher` del servicio de autenticacion, porque el
  contrato HTTP que lo invoca se cambia en T5 (U5). T6 (U6) elimina `iniciarSesion({ email, password })`, la
  dependencia `hasher` del servicio de autenticacion y `passHash` de la entidad. T6 es el unico lugar donde se
  elimina la contrasena; hasta entonces el camino legacy permanece intacto y sin cambios de comportamiento.
- Dependencia `codigosAcceso` del servicio de autenticacion: en T4 (U4) se declara opcional en `AuthServiceDeps`
  (`codigosAcceso?: CodigoLoginService`) y los dos metodos nuevos la exigen en tiempo de ejecucion con un error
  claro de configuracion si no esta presente. Motivo: el camino legacy solo se elimina en T6 (U6), y T6 es
  tambien el commit que vuelve obligatoria la dependencia y actualiza las construcciones de prueba que hoy la
  omiten. La composicion de produccion (`src/index.ts`) siempre la provee desde T4.

### D8. Fin de la contrasena

- `src/domain/entities.ts`: se elimina `passHash` de `Usuario`.
- `src/infrastructure/database/usuario.repository.ts`: se elimina el mapeo de `pass_hash` (la columna ya no existe).
- `src/http/validators/auth.validators.ts`: `loginSchema` sin `password`; nuevo `loginCodigoSchema`.
- Se elimina el error `CREDENCIALES_INVALIDAS` del catalogo de OpenAPI y de la documentacion, porque ya no hay
  contrasena que comparar.
- Los dobles en memoria de `tests/helpers/in-memory.ts` se actualizan en el mismo sentido.

### D9. OpenAPI y documentacion

- `src/http/openapi.ts`: los dos endpoints con ejemplos sin contrasena, los codigos de error nuevos y el
  catalogo de errores actualizado.
- `docs/api-guide.html` y `docs/flujo-aplicacion-movil.md`: flujo de dos pasos (solicitar codigo, ingresar codigo),
  tabla de endpoints con `email` y `codigo`, y secuencia de inicio de sesion sin contrasena.
- `README.md`: lista de archivos de `db/init`, variables de entorno nuevas y nota de aplicacion separada en la
  base de datos compartida.
- `CHANGELOG.md`: entradas de agregado, cambiado y eliminado, con la nota de despliegue de la migracion.
- `.env.example`: la politica de seguridad del entorno bloquea la lectura y la escritura de ese archivo. Las
  variables que deben agregarse quedan documentadas en README y CHANGELOG, y el pendiente se reporta al usuario.

### D10. Pruebas

- `tests/unit/codigo-login-service.test.ts`: generacion, hash, vigencia, reemplazo del codigo anterior, usuario
  inexistente, estado de cuenta, expiracion, intentos, invalidacion al quinto intento y consumo.
- `tests/unit/repositories.test.ts`: el repositorio nuevo, probado con el pool falso que graba el SQL.
- `tests/unit/auth-service.test.ts`: solicitud del codigo, verificacion correcta, codigo incorrecto, vencido,
  invalidado, estados de cuenta y desactivacion al decimo intento.
- `tests/integration/http.test.ts`: `POST /auth/login` responde que se envio el OTP, `POST /auth/login/code`
  devuelve los tokens, y los codigos de error y los limites de frecuencia.
- `tests/helpers/in-memory.ts`: doble en memoria del repositorio de codigo de acceso, y usuarios de prueba sin
  `passHash`.

## Tasks

| ID  | Specs  | Route                                                                                                                                     | Commit                    |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| T1  | S1, S2 | U1: persistencia del codigo de acceso: migracion `db/init/06-codigo-login.sql`, puerto, entidad, repositorio SQL y pruebas de repositorio | 407ce74                   |
| T2  | S1, S2 | U2: servicio de codigo de acceso: dominio, configuracion, doble en memoria y pruebas unitarias                                            | 00cdb8d                   |
| T3  | S2     | U3: correo del codigo de acceso: plantilla, servicio de correo, transporte y pruebas                                                      | -                         |
| T4  | S1, S2 | U4: servicio de autenticacion con codigo: `solicitarCodigoAcceso`, `iniciarSesionConCodigo` y pruebas unitarias                           | 6236f9a                   |
| T5  | S1, S2 | U5: contrato HTTP: validadores, controlador, rutas, OpenAPI, limites de frecuencia y pruebas de integracion                               | 1715537                   |
| T6  | S1     | U6: eliminacion de la contrasena: servicio, entidad, repositorio de usuarios, dobles en memoria y pruebas                                 | 80e2472                   |
| T7  | S1, S2 | U7: documentacion: guia de API, guia de la aplicacion movil, README y CHANGELOG                                                           | bf5050f                   |
| T8  | S1, S2 | U8: verificacion independiente del conjunto y revision nativa de los commits                                                              | verificacion (sin commit) |

## Log

- L1 (2026-11-12) - Peticion del usuario: "¿al iniciar sesión todavía pide la contraseña? Si todavía pide, hay
  que quitarlo. ya que el cliente pidió que en vez de tener contraseñas hay que usar OPT para iniciar sesión."
- L2 (2026-11-12) - Decision del usuario sobre el contrato: "la respuesta es usar "POST /auth/login" para el
  email y que responda que se envió el OTP y "POST /auth/login/code" con el email y con el OTP para obtener el JWT
  (iniciar sesión) correspondiente."
- L3 (2026-11-12) - Evidencia del estado actual: el CHANGELOG registra que la contrasena del registro ya se
  elimino ("La contraseña del registro: `POST /auth/register` ya no la recibe y la columna `pass_hash` se elimina de
  `usuario`") y que "El login no se modificó: sin la columna, valida contra un hash vacío y responde
  `CREDENCIALES_INVALIDAS` hasta que se defina el inicio de sesión por OTP".
- L4 (2026-11-12) - Evidencia del codigo: `src/http/validators/auth.validators.ts:25` exige `password` en el
  login; `src/infrastructure/database/usuario.repository.ts:22,72` mapea `passHash: ''`; la tabla
  `dbo.codigo_confirmacion` (`db/init/02-codigo-confirmacion.sql:13`) no tiene columna de proposito y su indice
  unico filtrado admite un solo codigo no consumido por cuenta, por lo que no sirve para el codigo de acceso.
- L6 (2026-11-12) - T1 entregado en el commit `407ce74` (`feat(auth): persist OTP login codes in dbo.codigo_login`), 582 lineas authored: ese commit es el limite de corte de la primera rebanada de revision. Evidencia: 18 pruebas del repositorio en verde, `typecheck` y `lint` en verde; `npm run format:check` falla unicamente por `.atl/.skill-registry.md` y `.atl/.skill-registry.cache.json`, que ya fallaban antes de este trabajo.
- L7 (2026-11-12) - T2 entregado en el commit `00cdb8d` (`feat(auth): add login OTP code domain service`), 368 lineas authored: el limite de corte de la segunda rebanada de revision. Evidencia: 10 pruebas del servicio del codigo en verde y 142 del total, `typecheck` y `lint` en verde.
- L12 (2026-11-12) - Correccion de la verificacion independiente en el commit `56d2140` (`fix(auth): stop revealing account existence when mail delivery fails`): la respuesta aceptada de la solicitud de codigo es ahora identica en todos los casos, de modo que el valor `correo_enviado` ya no permite enumerar cuentas. La revision nativa por riderecha se evaluo con tier alto y `reviewDue` en verdad, pero el host denego el consentimiento para este candidato: no se creo linaje, la revision no se ejecuto y no autoriza la entrega.
- L11 (2026-11-12) - Verificacion independiente (gentle-ai-verify) sobre la rama `feature/otp-login`: 151 pruebas y `npm run test:coverage` en verde (sentencias 97.34%, ramas 87.64%, funciones 98.9%, lineas 97.62%) y los 11 puntos de aceptacion verificados salvo dos que requieren SQL Server real (atomicidad del consumo y idempotencia de la migracion). Defecto encontrado por el verificador y corregido: `correo_enviado` distinguia una cuenta activa con fallo de SMTP (`false`) de un correo no registrado (`true`), lo que permitia enumerar cuentas; ahora la respuesta aceptada es siempre identica y el fallo de entrega solo se registra en el servidor.
- L10 (2026-11-12) - T4 entregado en el commit `6236f9a` (`feat(auth): add OTP login methods to the auth service`): metodos `solicitarCodigoAcceso` e `iniciarSesionConCodigo`, mas la composicion de produccion en `src/index.ts`. Evidencia: 37 pruebas enfocadas del servicio de autenticacion y 154 del total en verde, `typecheck` y `lint` en verde.
- L9 (2026-11-12) - Decisiones de ejecucion tras tres ciclos de estancamiento del escritor en T4: la dependencia `codigosAcceso` se declara opcional en T4 y obligatoria en T6, para que cada unidad de trabajo sea pequena y el proyecto compile en cada commit. No cambia el comportamiento observable del flujo de inicio de sesion con OTP.
- L8 (2026-11-12) - Aclaracion de secuencia para el escritor: D7 y T6 se leian como contradictorios. T4 agrega los dos metodos nuevos y conserva el camino legacy de la contrasena; la eliminacion ocurre unicamente en T6. No cambia ninguna especificacion de comportamiento.
- L5 (2026-11-12) - Decisiones tecnicas tomadas por el orquestador: el codigo de acceso se entrega por correo
  electronico (unico canal disponible); se reutiliza el alcance `auth:login` en vez de crear uno nuevo; el codigo
  de acceso vive en una tabla nueva en vez de alterar `dbo.codigo_confirmacion`; se conserva la regla de 10
  intentos que desactiva la cuenta y se agrega el invalidado al quinto intento; `.env.example` no puede
  modificarse por la politica de seguridad del entorno.
