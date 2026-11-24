# Registro de cambios

Los cambios relevantes de este proyecto se documentan en este archivo, conforme a Keep a Changelog y al versionado semántico.

## [Sin publicar]

### Agregado

-Tabla `dbo.codigo_confirmacion` para almacenar el hash argon2id del código de confirmación.
-Variables `CONFIRM_CODE_TTL_HOURS`, `CONFIRM_CODE_MAX_ATTEMPTS`, `RATE_LIMIT_CONFIRM_PER_IDENTIFIER` y `RATE_LIMIT_CONFIRM_PER_IP` para configurar la vigencia, los intentos y los límites de frecuencia.

### Cambiado

-La confirmación de correo por enlace se reemplazó por un código OTP de 6 dígitos enviado por correo.

### Eliminado

-El token JWT de confirmación y las variables `JWT_CONFIRM_SECRET` y `JWT_CONFIRM_TTL`.

-Endpoints de contraseña `forgot-password`, `reset-password` (GET y POST) y `change-password`, con su lógica de servicio, token de reseteo, plantilla de correo y variables `JWT_RESET_SECRET` y `JWT_RESET_TTL`.
-Endpoints de pin de acceso `/auth/pin/configurar`, `/auth/pin/verificar` y `/auth/pin/revocar`, con su servicio, repositorio, validadores y el script `db/init/02-pin-acceso.sql`. `/auth/me` ya no devuelve `pin_configurado`.
-Alcances `auth:pin` y `auth:password-reset` de las API Key. La tabla `pin_acceso` no se elimina de las bases ya creadas.

## [1.0.0] - 2026-11-11

### Agregado

-Núcleo del microservicio Express con TypeScript estricto.
-Registro de cuentas, confirmación de correo, inicio, renovación y cierre de sesión, recuperación y cambio de contraseña y consulta de perfil.
-Hash de contraseñas argon2id y tokens JWT de acceso, confirmación y reseteo en la versión inicial; los tokens de confirmación y reseteo se retiraron posteriormente.
-Refresh token rotativo almacenado como hash en la tabla LogSession.
-Desactivación de cuentas en estado `D` tras diez intentos fallidos consecutivos.
-API Key de cliente almacenada como hash SHA-256 y endpoint público de registro de instalaciones.
-Cabeceras de seguridad con Helmet, CORS por lista explícita y límites por identificador y dirección IP.
-Esquema idempotente de las tablas Usuario, LogSession y ApiKey en SQL Server, definido en archivos .sql que se aplican tanto desde la aplicación como directamente con sqlcmd.
-Creación idempotente de la base de datos por código al aplicar el esquema.
-Imagen Docker multietapa con node:24-alpine, Docker Compose con SQL Server y configuración de referencia nginx con TLS.
-Suite automatizada con Vitest y supertest.
-Guía de consumo de la API en `docs/api-guide.html`.
-Documentación interactiva con Swagger UI en `/api-docs` y documento OpenAPI 3.1 en `/api-docs.json`, con los cuerpos de petición derivados de los validadores zod.
-Documentación del consumo desde la aplicación móvil con diagramas de secuencia, diagrama de estados de la cuenta y tablas de referencia.
-Soporte de pin de acceso por cuenta: configuración, verificación como segundo factor y revocación, con el verificador cifrado con argon2id y los intentos fallidos contados aparte del bloqueo de la cuenta.
-Conexión a la instancia de SQL Server desplegada en AWS RDS, configurada por variables de entorno, con el cifrado del tráfico activo y sin validación del certificado del servidor.

### Cambiado

-Sin cambios previos: esta es la versión inicial.

### Corregido

-Sin correcciones registradas para esta versión inicial.

### Mejorado

-Sin mejoras respecto de una versión anterior: esta es la versión inicial.

## Pendientes

-Prioritario: implementar el endpoint de reenvío del código de confirmación. Si el código vence o se invalida, la cuenta queda en estado `C` sin forma de obtener uno nuevo por la API.
-Actualizar la plantilla `.env.example` antes del próximo despliegue: retirar `JWT_CONFIRM_SECRET` y `JWT_CONFIRM_TTL`, agregar `CONFIRM_CODE_TTL_HOURS`, `CONFIRM_CODE_MAX_ATTEMPTS`, `RATE_LIMIT_CONFIRM_PER_IDENTIFIER` y `RATE_LIMIT_CONFIRM_PER_IP`, y retirar `PUBLIC_BASE_URL`, que quedó sin uso.

-CAPTCHA en los formularios de inicio de sesión y contraseña (lineamiento 3.8).
-Endpoint administrativo para desbloquear cuentas en estado `D` (control de intentos, lineamiento 1.6.4): actualmente el operador autorizado debe usar el procedimiento `db/scripts/unlock-user.sql` directamente en la base de datos.
-OAuth 2.0 con PKCE y apertura del navegador del sistema para la aplicación móvil (lineamiento 1.6.3): esta versión usa inicio de sesión propio con refresh token.
-Autenticación de usuarios de aplicación contra el LDAP institucional (lineamiento 4.4).
-Doble factor de autenticación, en lo posible (lineamiento 3.8).

[1.0.0]: ./releases/tag/v1.0.0
