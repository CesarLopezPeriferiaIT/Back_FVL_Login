-- Creacion de la base de datos de la aplicacion, si todavia no existe.
--
-- Este es el unico script que se ejecuta contra la base de sistema master; los demas se aplican
-- sobre la base de la aplicacion. El script que los aplica, db:init, sustituye la variable
-- $(DB_NAME) por el valor de DB_DATABASE antes de enviarlo al servidor.
--
-- La sentencia va dentro de EXEC porque en T-SQL la instruccion CREATE DATABASE debe ser la unica
-- de su lote, y no puede combinarse con un IF en el mismo lote.
--
-- El nombre se valida contra un formato estricto antes de interpolarse, porque aqui no puede
-- parametrizarse.

IF DB_ID(N'$(DB_NAME)') IS NULL
    EXEC('CREATE DATABASE [$(DB_NAME)]');
GO
