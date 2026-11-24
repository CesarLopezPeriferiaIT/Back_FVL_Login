-- Agrega a dbo.usuario el departamento, el municipio y el rol, con llave foranea a sus catalogos.
-- Las columnas son NOT NULL porque son datos obligatorios de la cuenta: agregarlas exige que la
-- tabla este vacia (en una base con cuentas existentes el ALTER falla).
-- Idempotente: cada columna y cada restriccion se crea solo si falta.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('dbo.usuario', 'codigo_departamento') IS NULL
BEGIN
    ALTER TABLE dbo.usuario ADD codigo_departamento VARCHAR(2) NOT NULL;
END
GO

IF COL_LENGTH('dbo.usuario', 'codigo_municipio') IS NULL
BEGIN
    ALTER TABLE dbo.usuario ADD codigo_municipio VARCHAR(5) NOT NULL;
END
GO

IF COL_LENGTH('dbo.usuario', 'codigo_rol') IS NULL
BEGIN
    ALTER TABLE dbo.usuario ADD codigo_rol INT NOT NULL;
END
GO

IF OBJECT_ID('dbo.FK_usuario_departamento', 'F') IS NULL
BEGIN
    ALTER TABLE dbo.usuario ADD CONSTRAINT FK_usuario_departamento
        FOREIGN KEY (codigo_departamento) REFERENCES dbo.catalogo_departamento (codigo);
END
GO

IF OBJECT_ID('dbo.FK_usuario_municipio', 'F') IS NULL
BEGIN
    ALTER TABLE dbo.usuario ADD CONSTRAINT FK_usuario_municipio
        FOREIGN KEY (codigo_municipio) REFERENCES dbo.catalogo_municipio (codigo);
END
GO

IF OBJECT_ID('dbo.FK_usuario_rol', 'F') IS NULL
BEGIN
    ALTER TABLE dbo.usuario ADD CONSTRAINT FK_usuario_rol
        FOREIGN KEY (codigo_rol) REFERENCES dbo.catalogo_rol (codigo);
END
GO
