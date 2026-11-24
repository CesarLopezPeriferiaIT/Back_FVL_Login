# Confirmacion de correo por codigo OTP de 6 digitos

Reemplaza el flujo de confirmacion por enlace con token JWT por un codigo OTP de 6 digitos que el
servicio envia por correo y que la persona digita en la aplicacion. El alcance de esta sesion es
unicamente la confirmacion de correo.

## Specs

### S1

> Se eliminaron muchas cosas que el cliente cambió a último momento, en esta sesión SOLO se trabajará en confirmar correo.

### S2

> Termina con éxito el registro(esto lo hace otro desarrollador) -> El back debe enviar un correo con un código OTP de 6 dígitos -> la persona debe ingresar ese código en la apliación -> se confirma que el usuario se activó correctamente [Happy Path]

### S3

> Si el código ingresado no coincide aparece error. El código mantiene vigencia de 1 día nada más, si ya se venció debe mostrar el error correspondiente.

### S4

> No, dejarlo documentado como pendiente

Decision del usuario sobre el reenvio del codigo: no se implementa un endpoint de reenvio en esta
sesion; queda documentado como pendiente junto con la consecuencia de la decision de S5.

### S5

> Sí, máximo 5 intentos

Decision del usuario sobre los intentos de ingreso del codigo: el codigo se invalida al quinto
intento fallido.

## Decisiones tecnicas

Las decisiones siguientes concretan S2, S3, S4 y S5. El escritor las implementa al pie de la letra.

### D1. Almacenamiento del codigo

El codigo se guarda en una tabla nueva, porque la aplicacion movil solo conoce los 6 digitos y el
servidor debe poder localizar el codigo vigente de una cuenta a partir del correo.

- Archivo nuevo `db/init/02-codigo-confirmacion.sql`, con el mismo estilo de los archivos
  existentes: `SET QUOTED_IDENTIFIER ON` y `SET ANSI_NULLS ON`, bloques idempotentes separados por
  `GO` y un comentario que explique el proposito de la tabla.
- Tabla `dbo.codigo_confirmacion`:
  - `uuid UNIQUEIDENTIFIER NOT NULL`, clave primaria agrupada.
  - `uuid_usuario UNIQUEIDENTIFIER NOT NULL`, clave foranea a `dbo.usuario (uuid)`.
  - `codigo_hash NVARCHAR(512) NOT NULL`, hash argon2id del codigo de 6 digitos.
  - `expira_en DATETIME2(3) NOT NULL`, instante de vencimiento del codigo.
  - `intentos INT NOT NULL` con valor por defecto `0`.
  - `invalidado BIT NOT NULL` con valor por defecto `0`.
  - `usado_en DATETIME2(3) NULL`, marca de uso del codigo.
  - `fecha_creacion DATETIME2(3) NOT NULL` con valor por defecto `SYSUTCDATETIME()`.
- Indice unico filtrado `UX_codigo_confirmacion_usuario` sobre `dbo.codigo_confirmacion
(uuid_usuario)` con filtro `WHERE usado_en IS NULL AND invalidado = 0`, de modo que exista como
  maximo un codigo no consumido por cuenta.

El filtro del indice no puede depender del tiempo: un indice filtrado de SQL Server no admite
funciones no deterministas como `SYSUTCDATETIME()`. Por eso un codigo vencido sigue ocupando el
indice y, antes de generar un codigo nuevo, hay que invalidar el anterior. El orden es invalidar
primero e insertar despues.

El repositorio busca el codigo NO CONSUMIDO, es decir no usado y no invalidado, exista o no su
vigencia. Si el repositorio excluyera los codigos vencidos, el servicio no podria distinguir "el
codigo vencio" de "no hay codigo" y responderia con el error equivocado, que es exactamente la
diferencia que S3 exige mostrar.

El archivo va aparte y no dentro de `db/init/01-schema.sql` para que pueda aplicarse de forma
independiente en la base desplegada, que es compartida con otra aplicacion.

### D2. El codigo nunca se guarda en texto plano

- El codigo se genera con `randomInt` de `node:crypto` sobre el rango `[0, 1000000)` y se formatea
  con `padStart(6, '0')`, de modo que un codigo puede empezar por cero.
- Se reutiliza el puerto `PasswordHasher` que ya existe en `src/domain/password-hasher.ts` para
  hashear y comparar el codigo. No se crea un puerto nuevo.
- En la base de datos solo se persiste el hash. El codigo en texto plano solo existe en memoria
  mientras se genera y mientras se envia el correo.

### D3. Vigencia de un dia

- `expiraEn` se calcula al generar el codigo: `expiraEn = ahora + CONFIRM_CODE_TTL_HOURS horas`.
- `CONFIRM_CODE_TTL_HOURS` es una variable de entorno entera, positiva, con valor por defecto `24`,
  que representa el dia de vigencia de S3.
- La comprobacion de vencimiento se hace ANTES de comparar el codigo, para que un codigo vencido
  devuelva siempre el error de vencimiento y nunca el de codigo incorrecto.

### D4. Errores

Todos se lanzan como `AppError` desde `src/shared/errors.ts`. Los mensajes van en espanol y sin
tildes, como el resto del repositorio.

| Situacion                                | `code`                           | HTTP | Mensaje                                                                   |
| ---------------------------------------- | -------------------------------- | ---- | ------------------------------------------------------------------------- |
| El correo no tiene una cuenta registrada | `USUARIO_NO_ENCONTRADO`          | 404  | `No existe una cuenta asociada al correo.`                                |
| La cuenta ya esta confirmada             | `CUENTA_YA_CONFIRMADA`           | 409  | `La cuenta ya fue confirmada.`                                            |
| La cuenta no tiene un codigo vigente     | `CODIGO_CONFIRMACION_NO_EXISTE`  | 404  | `No hay un codigo de confirmacion vigente para esta cuenta.`              |
| El codigo vencio                         | `CODIGO_CONFIRMACION_VENCIDO`    | 400  | `El codigo de confirmacion vencio. Solicite un nuevo codigo.`             |
| El codigo no coincide                    | `CODIGO_CONFIRMACION_INVALIDO`   | 400  | `El codigo de confirmacion no coincide.`                                  |
| Se agotaron los 5 intentos               | `CODIGO_CONFIRMACION_INVALIDADO` | 429  | `El codigo de confirmacion se invalido por demasiados intentos fallidos.` |

### D5. Intentos fallidos

- Cada comparacion fallida incrementa el contador `intentos` del codigo vigente.
- Cuando el contador alcanza `CONFIRM_CODE_MAX_ATTEMPTS` (variable de entorno entera, positiva,
  valor por defecto `5`, que representa S5), el codigo se marca con `invalidado = 1` y la respuesta
  es `CODIGO_CONFIRMACION_INVALIDADO` con HTTP 429.
- El quinto intento fallido es el que invalida el codigo: la persona dispone de cinco intentos en
  total y el quinto error deja el codigo inutilizable.
- Consecuencia asumida y documentada: como S4 deja el reenvio pendiente, una cuenta cuyo codigo
  vencio o se invalido queda en estado `C` sin forma de obtener un codigo nuevo por la API. Esa
  limitacion queda escrita en `CHANGELOG.md` como pendiente prioritario.

### D6. Contrato HTTP

- `POST /auth/confirm-email` con cuerpo JSON `{"email": "...", "codigo": "123456"}`.
- Se elimina `GET /auth/confirm-email`: el flujo por enlace desaparece y el codigo viaja en el
  cuerpo, no en la URL, para no escribirlo en los registros de acceso.
- Se mantiene la exigencia de API Key con el permiso `auth:confirm-email`.
- El validador zod exige correo valido y `codigo` con exactamente 6 digitos.
- La respuesta exitosa es 200 con la forma de `src/http/http-response.ts`
  (`message`, `error`, `code`, `data`) y el mensaje `Correo confirmado.`, con el usuario publico
  en `data`.
- La cuenta pasa de estado `C` a `A`.

### D7. Limite de frecuencia

- Se anaden a `crearLimitadores` (`src/http/middlewares/rate-limit.ts`) dos limitadores para la
  confirmacion: uno por identificador (el correo) y otro por direccion IP, con la misma ventana
  `RATE_LIMIT_WINDOW_MINUTES` que el resto del servicio.
- `RATE_LIMIT_CONFIRM_PER_IDENTIFIER` con valor por defecto `10` y `RATE_LIMIT_CONFIRM_PER_IP` con
  valor por defecto `30`.

### D8. Correo electronico

- El correo de confirmacion lleva el codigo de 6 digitos, no un enlace. El estado final es el
  siguiente:
- El servicio de correo expone `enviarCodigoConfirmacion(destinatario, codigo, expiraEn)` y la
  plantilla `plantillaCodigoConfirmacion({ codigo, expiraEn })`.
- El correo por enlace se retira por completo: no quedan `enviarConfirmacion` ni
  `plantillaConfirmacion`.
- El asunto se conserva: `Confirme su cuenta en el portal de la Fundacion Valle del Lili`.
- El cuerpo y el HTML muestran el codigo de 6 digitos, sin guiones, espacios ni puntos, en una
  linea propia para que la persona pueda digitarlo tal cual, e indican el vencimiento.
- Las horas restantes se calculan desde `expiraEn` contra la hora actual, con un minimo de una
  hora, de modo que el mensaje dice `El codigo expira en 24 horas.` o `El codigo expira en 1 hora.`
- El cambio se implementa en dos etapas, para que cada una compile y deje sus pruebas en verde.
  Primero se agrega la capacidad de enviar el codigo como metodo y plantilla nuevos, sin tocar el
  correo por enlace, que sigue en pie. Despues el registro pasa a usar la capacidad nueva y el
  correo por enlace se retira junto con su unico llamador. El estado final es el descrito arriba:
  un solo correo de confirmacion, el del codigo.

### D9. Retiro del token JWT de confirmacion

El mecanismo de enlace desaparece, asi que su soporte tambien:

- `src/domain/token-service.ts`: se eliminan `crearTokenConfirmacion`, `verificarTokenConfirmacion`
  y el proposito `email-confirmation` de `PropositoToken`.
- `src/config/env.ts`: se eliminan `JWT_CONFIRM_SECRET` y `JWT_CONFIRM_TTL`, y se anaden
  `CONFIRM_CODE_TTL_HOURS` y `CONFIRM_CODE_MAX_ATTEMPTS` con sus valores por defecto.
- `docker-compose.yml` y `.env.example`: se elimina `JWT_CONFIRM_SECRET` y se anaden las dos
  variables nuevas con su comentario. `.env.example` se edita sobre el contenido versionado en Git
  (`git show HEAD:.env.example`), porque la politica de seguridad del entorno bloquea la lectura
  directa de ese archivo.
- `tests/helpers/config.ts` y `tests/unit/token-service.test.ts` se actualizan en consecuencia.

### D10. Composicion, API del servicio de codigos y dobles

- `src/index.ts` construye el repositorio de codigos y el servicio de codigos, y los inyecta en el
  servicio de autenticacion.
- El servicio de codigos expone tres operaciones:
  - `generar(email)`: invalida el codigo no consumido anterior, genera el codigo de 6 digitos, lo
    persiste hasheado y devuelve `{ codigo, expiraEn, uuidCodigo }`. El codigo en texto plano se
    devuelve al llamador para que lo envie por correo; nunca se persiste en claro.
  - `validar(email, codigo)`: comprueba la cuenta, el estado, la existencia, el vencimiento y la
    igualdad del codigo, y devuelve `{ usuario, uuidCodigo }` sin consumir el codigo.
  - `marcarUsado(uuidCodigo)`: consume el codigo.
- Quien integre el envio del correo con el flujo de registro llama a `generar` y entrega el codigo
  devuelto al servicio de correo. El orden es generar primero, enviar despues. El cambio de firma
  del servicio de correo viaja siempre junto con su unico llamador, de modo que no queda ninguna
  firma incompatible en el codigo.
- `tests/helpers/in-memory.ts` incluye el doble en memoria del repositorio de codigos, con el
  comportamiento de vigencia, contador de intentos e invalidacion.

### D11. Base de datos real

- Esta sesion NO aplica el esquema en ninguna base de datos real. No se ejecuta `npm run db:init`
  ni `scripts/apply-schema.ts` contra la instancia desplegada, que es compartida con otra
  aplicacion.
- Las pruebas usan los dobles en memoria; no requieren base de datos.
- `README.md` y `CHANGELOG.md` indican que el archivo nuevo debe aplicarse en la base desplegada
  antes de desplegar el servicio.

### D12. Convenciones del repositorio

- Identificadores, mensajes y comentarios en espanol; JSDoc de archivo en ingles con `@author` y
  `@version`.
- TypeScript estricto sin `any`; `unknown` en los limites de entrada; imports con extension `.js`.
- `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm test` pasan sin errores, y la
  cobertura se mantiene sobre el minimo del 80 %.

## Tasks

| ID  | Specs                           | Descripcion                                                                                                                                                                                                                                           | Ruta   | Commit |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| T1  | S2, S3, D1, D2, D10             | Persistencia del codigo: tabla `dbo.codigo_confirmacion` en `db/init/02-codigo-confirmacion.sql`, entidad de dominio, puerto `CodigoConfirmacionRepository` y repositorio SQL Server                                                                  | worker | A      |
| T2  | S2, S3, S5, D2, D3, D4, D5, D10 | Servicio de dominio `codigo-confirmacion-service.ts`: generacion del codigo de 6 digitos, hash argon2id, calculo de vigencia, persistencia y verificacion con los errores y el limite de intentos, con el doble en memoria del repositorio de codigos | worker | A      |
| T3  | S2, S3, D3, D4, D6, D10         | Cableado del flujo: `registrar` envia el codigo al terminar el registro y `confirmarCodigo` activa la cuenta que pasa de `C` a `A`                                                                                                                    | worker | B      |
| T4  | S2, S3, D6, D7                  | Superficie HTTP: validador zod del cuerpo, controlador, ruta `POST /auth/confirm-email` (se elimina el `GET`), limitadores de frecuencia y documento OpenAPI                                                                                          | worker | B      |
| T5  | S2, S3, D8, D9                  | Correo con el codigo y retiro del token JWT de confirmacion: plantilla, servicio de correo, `token-service`, configuracion, `docker-compose.yml` y `.env.example`                                                                                     | worker | B      |
| T6  | S2, S3, S5, D4, D6, D10         | Pruebas: unitarias del servicio de codigos y del repositorio, actualizacion de las pruebas de dominio existentes e integracion HTTP del flujo completo con el codigo                                                                                  | worker | A, B   |
| T7  | S1, S4, D5, D11                 | Documentacion: `docs/api-guide.html`, `docs/flujo-aplicacion-movil.md`, `README.md`, `CLAUDE.md` y `CHANGELOG.md`, con el reenvio del codigo y la consecuencia de S5 como pendientes                                                                  | worker | C      |

## Log

- L1 (2026-11-24) - Peticion original del usuario:
  > Se eliminaron muchas cosas que el cliente cambió a último momento, en esta sesión SOLO se trabajará en confirmar correo.
  > El proceso es el siguiente:
  > Termina con éxito el registro(esto lo hace otro desarrollador) -> El back debe enviar un correo con un código OTP de 6 dígitos -> la persona debe ingresar ese código en la apliación -> se confirma que el usuario se activó correctamente [Happy Path]
  > Si el código ingresado no coincide aparece error. El código mantiene vigencia de 1 día nada más, si ya se venció debe mostrar el error correspondiente.
- L2 (2026-11-24) - Decisiones del usuario sobre dos preguntas abiertas:
  - Reenvio del codigo: `No, dejarlo documentado como pendiente`. El endpoint de reenvio no se
    implementa en esta sesion.
  - Intentos de ingreso del codigo: `Sí, máximo 5 intentos`. El quinto intento fallido invalida el
    codigo.
  - Consecuencia asumida y comunicada: sin reenvio, una cuenta con el codigo vencido o invalidado
    queda en estado `C` sin recuperacion por la API. Queda como pendiente prioritario en
    `CHANGELOG.md`.
- L3 (2026-11-24) - Nota de integracion para el otro desarrollador que trabaja en el registro: el
  token JWT de confirmacion se retira y con el la funcion `crearTokenConfirmacion`. Quien integre
  el envio del correo con su flujo de registro debe llamar a `generar` del servicio de codigos de
  confirmacion, que genera el codigo y lo persiste, y entregar despues ese codigo al servicio de
  correo.
- L4 (2026-11-24) - Nota de operacion: el esquema de la tabla nueva no se aplica en esta sesion
  contra ninguna base real, porque la instancia desplegada es compartida con otra aplicacion. El
  archivo `db/init/02-codigo-confirmacion.sql` queda listo para que quien despliegue lo aplique
  antes de desplegar el servicio.
- L5 (2026-11-24) - Correccion del contrato de busqueda de codigos, detectada por el escritor de
  la unidad de persistencia y dominio antes de escribir codigo:
  - El contrato original pedia que el repositorio devolviera solo el codigo vigente, es decir
    descartando los vencidos. Eso impedia que el servicio distinguiera el codigo vencido del
    caso sin codigo, y por tanto obligaba a responder con el error equivocado, en contra de S3.
  - El indice unico filtrado tampoco puede excluir los codigos vencidos, porque un indice filtrado
    de SQL Server no admite funciones no deterministas como `SYSUTCDATETIME()`. Un codigo vencido
    sigue ocupando el indice, asi que el reemplazo exige invalidar el anterior antes de insertar
    el nuevo.
  - Ajuste aplicado: el repositorio devuelve el codigo NO CONSUMIDO (no usado y no invalidado),
    exista o no su vigencia, y es el servicio quien decide si vencio. Se documento en D1.
- L6 (2026-11-24) - Ajuste de la frontera entre el servicio de codigos y el flujo de registro,
  detectado por el escritor antes de editar:
  - El contrato inicial pedia que el servicio de codigos enviara el correo. Pero el cambio de
    firma de `MailService.enviarConfirmacion` dejaba incompatible la llamada existente en el
    registro, que es su unico llamador, y hacia fallar el typecheck de la unidad de persistencia.
  - Ajuste aplicado: el servicio de codigos genera, persiste y devuelve el codigo en claro para
    que el llamador lo envie por correo. El cambio de firma del correo viaja con su unico
    llamador y no queda ninguna firma incompatible en el codigo. Se documento en D10.
- L7 (2026-11-24) - Ajuste del alcance de T1 para que la especificacion y el encargo del escritor
  digan exactamente lo mismo:
  - T1 queda en la tabla, la entidad, el puerto y el repositorio SQL Server. El doble en memoria
    del repositorio de codigos se implementa junto con el servicio de codigos, en la tarea
    siguiente.
  - Motivo: cuando la especificacion y el encargo discrepan, el escritor sigue la
    especificacion, porque es el documento de mayor prioridad. En dos intentos consecutivos eso
    produjo un bloqueo por alcance antes de escribir la primera linea de codigo.
- L8 (2026-11-24) - Orden de implementacion del cambio de correo, para que la implementacion por
  etapas no contradiga el estado final:
  - Primera etapa: se agrega la capacidad de enviar el codigo (`enviarCodigoConfirmacion` y
    `plantillaCodigoConfirmacion`) sin tocar el correo por enlace, que sigue en pie.
  - Segunda etapa: el registro usa la capacidad nueva y el correo por enlace se retira junto con
    su unico llamador.
  - El estado final no cambia: un solo correo de confirmacion, el del codigo. Se documento en D8.
- L9 (2026-11-24) - Reparto en commits y frontera de cada unidad de trabajo, con el conteo real de
  pruebas medido ejecutando la suite sobre cada commit:
  - `ADD CONFIRMATION CODE PERSISTENCE AND DOMAIN` (500 lineas): tabla, entidad, puerto,
    repositorio de SQL Server, doble en memoria, servicio de codigos, variables de configuracion y
    sus pruebas. La configuracion de este commit conserva el secreto y el TTL de confirmacion, y
    `PUBLIC_BASE_URL`, porque en esa unidad el token de confirmacion y el enlace todavia existen.
    Validacion: 114 pruebas aprobadas, typecheck y lint limpios.
  - `CONFIRM EMAIL WITH ONE TIME CODE` (621 lineas): correo con el codigo, registro que lo envia,
    `confirmarCodigo`, contrato HTTP con `{email, codigo}`, limitadores de frecuencia y retiro del
    token JWT de confirmacion con sus variables. Validacion: 116 pruebas aprobadas, typecheck y lint
    limpios.
  - `DOCUMENT OTP CONFIRMATION FLOW`: guia de API, documento de consumo desde la aplicacion movil,
    README, CLAUDE y CHANGELOG.
  - La unidad de persistencia y dominio supera las 400 lineas de la rebanada orientativa porque
    arrastra la tabla, el esquema de la base de datos y las pruebas del servicio de codigos, que es
    una sola unidad de comportamiento.
  - Queda pendiente que el responsable actualice la plantilla de variables de entorno del
    repositorio: el agente no puede editarla porque la politica de seguridad del entorno bloquea esa
    ruta. El detalle de las variables esta en el CHANGELOG.
- L10 (2026-11-24) - Correccion posterior a la verificacion independiente, con hallazgos
  reproducibles y no solo lectura de codigo:
  - Alta: la activacion de la cuenta no estaba condicionada al estado vigente del codigo, de modo
    que una validacion correcta que ya habia quedado en vuelo podia completar y activar la cuenta
    despues de que el quinto fallo invalidara el codigo. El limite de intentos dejaba de ser
    autoritativo. Se corrigio con una activacion condicional en una sola sentencia, que exige que
    el codigo siga sin usar, sin invalidar y sin vencer en el instante de la escritura, y que la
    cuenta este en estado `C`. Se agrego prueba de regresion que reproduce la carrera con una
    comparacion bloqueada.
  - Media: permanecia el correo por enlace, ya sin uso. Se retiraron `enviarConfirmacion`,
    `plantillaConfirmacion` y el helper `boton`.
  - Media: faltaban las variables de la confirmacion en el compose y la instruccion de aplicar
    `db/init/02-codigo-confirmacion.sql` antes del despliegue. Se completaron en el compose, el
    README y el CHANGELOG.
  - Media: las cabeceras JSDoc de los archivos de dominio modificados estaban en espanol. Se
    normalizaron en ingles, conforme a D12.
- L11 (2026-11-24) - Verificacion del SQL contra una instancia real y disposicion de la revision
  nativa:
  - El DDL y las dos sentencias de seguridad se ejecutaron contra un SQL Server 2022 local en
    Docker, nunca contra la instancia desplegada, que es compartida con otra aplicacion. El esquema
    se aplico dos veces para comprobar que es idempotente, y quedaron las cuatro tablas con sus
    indices.
  - La activacion condicionada se midio en tres casos: con el codigo vigente afecta una fila y
    deja la cuenta en `A`; con la cuenta ya activa no afecta ninguna; con el codigo invalidado no
    afecta ninguna y la cuenta sigue en `C`.
  - El incremento atomico se midio en cinco intentos sucesivos: el `OUTPUT` devuelve el contador y
    la marca de invalidacion simultaneos, y el quinto intento deja `intentos = 5` con
    `invalidado = 1`. No existe el estado intermedio con el contador en cinco y el codigo vigente.
  - Se corrigio el orden de `OUTPUT` y `WHERE` en la sentencia de incremento: en T-SQL el `OUTPUT`
    va entre el `SET` y el `WHERE`. El defecto no lo detectaba ninguna prueba con dobles en
    memoria; lo detecto la revision del escritor.
  - La revision nativa por riderecha se evaluo con tier alto y `reviewDue` en los dos candidatos,
    el inicial y el ya corregido. En ambos, el consentimiento fue denegado en el host y no se creo
    linaje. La revision no se ejecuto y nunca autoriza la entrega.
  - La plantilla de variables de entorno del repositorio no pudo modificarse porque la politica de
    seguridad del entorno bloquea esa ruta. Queda como pendiente manual y anotado en el CHANGELOG.
- L12 (2026-11-24) - Correccion final de los mensajes de error y prueba de serializacion contra SQL
  Server real:
  - La activacion condicionada se completa con `UPDLOCK, HOLDLOCK` en la subconsulta `EXISTS`, de
    modo que la comprobacion y la escritura se serialicen frente a una invalidacion concurrente.
  - Los dos casos en los que el mensaje mentia quedaron corregidos: cuando el codigo vence durante
    la operacion, la respuesta es 400 `CODIGO_CONFIRMACION_VENCIDO`, y cuando otra peticion confirmo
    el codigo primero, la respuesta es 409 `CUENTA_YA_CONFIRMADA`. La causa real se determina
    reconsultando el estado de la cuenta y el ultimo codigo de esa cuenta.
  - La serializacion se comprobo por ejecucion contra un SQL Server 2022 local, con dos sesiones
    concurrentes: una invalido el codigo en una transaccion abierta durante diez segundos y la otra
    intento activar la cuenta en paralelo. La activacion espero 8293 milisegundos y afecto cero
    filas, y la cuenta permanecio en estado `C`. Sin los bloqueos, la segunda sesion habria leido la
    instantanea previa a la invalidacion y habria activado la cuenta.
- L13 (2026-11-24) - El incremento de intentos ya no aplica a un codigo vencido, y el mensaje del
  error dice la causa real:
  - La sentencia atomica del incremento incluye la condicion de vigencia en su `WHERE`, de modo que un
    codigo que vencio durante la comparacion no acumula intentos ni se invalida. Al no poder
    registrarse el intento, la clasificacion por estado real responde 400 `CODIGO_CONFIRMACION_VENCIDO`.
  - Verificado por ejecucion contra un SQL Server 2022 local, con las sentencias tomadas del propio
    repositorio: el incremento sobre un codigo vigente afecta una fila y deja el contador en uno; el
    mismo incremento sobre un codigo vencido no afecta ninguna fila y deja el contador en uno y el
    codigo sin invalidar; y la activacion con un codigo vigente afecta una fila.
