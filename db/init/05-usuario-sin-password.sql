-- Elimina la columna pass_hash de dbo.usuario: las cuentas se crean solo con el correo.
-- Idempotente: no hace nada si la columna ya no existe (bases nuevas creadas por 01-schema.sql).

IF COL_LENGTH('dbo.usuario', 'pass_hash') IS NOT NULL
BEGIN
    ALTER TABLE dbo.usuario DROP COLUMN pass_hash;
END
GO
