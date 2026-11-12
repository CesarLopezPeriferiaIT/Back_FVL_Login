-- Procedimiento manual de desbloqueo de una cuenta desactivada por intentos fallidos.
--
-- Los lineamientos exigen restringir los intentos de autenticacion, y esta version desactiva la
-- cuenta (estado D) al alcanzar diez intentos fallidos consecutivos. En esta version no existe un
-- endpoint administrativo de desbloqueo: el cambio se realiza directamente sobre la base de datos
-- por parte del operador autorizado.
--
-- Uso: sustituir el valor de @correo y ejecutar el script sobre la base FVL_Login.
-- El script es idempotente: puede ejecutarse varias veces sobre la misma cuenta.

SET NOCOUNT ON;

-- QUOTED_IDENTIFIER y ANSI_NULLS se activan de forma explicita porque sqlcmd los deja
-- desactivados y la tabla log_session tiene un indice filtrado que los exige en ON.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;

-- Correo electronico de la cuenta a desbloquear.
DECLARE @correo NVARCHAR(256) = 'usuario@ejemplo.co';

-- Estado al que se devuelve la cuenta:
--   A = activa: el usuario vuelve a poder iniciar sesion de inmediato.
--   C = por confirmar: obliga a confirmar de nuevo el correo (el enlace de reseteo de contrasena
--       sirve para reenviarlo).
--   I = inactiva: el usuario no puede iniciar sesion hasta un nuevo desbloqueo.
DECLARE @estado_destino CHAR(1) = 'A';

BEGIN TRANSACTION;

-- 1. Devuelve la cuenta al estado destino solo si estaba efectivamente desactivada.
UPDATE dbo.usuario
SET estado = @estado_destino,
    fecha_modificacion = SYSUTCDATETIME()
WHERE Email = @correo
  AND estado = 'D';

-- 2. Elimina los intentos fallidos posteriores al ultimo acceso exitoso. El contador de intentos
-- se deriva de estas filas, por lo que borrarlas reinicia el conteo y evita que la cuenta se
-- desactive de nuevo en el siguiente intento fallido.
DELETE FROM dbo.log_session
WHERE successful = 0
  AND uuid_usuario = (SELECT uuid FROM dbo.usuario WHERE Email = @correo);

COMMIT TRANSACTION;

-- 3. Verificacion del estado final de la cuenta.
SELECT uuid,
       Email,
       estado,
       tyc,
       fecha_creacion,
       fecha_modificacion
FROM dbo.usuario
WHERE Email = @correo;
