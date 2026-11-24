-- Tabla de codigos de confirmacion de correo.
-- Cada cuenta tiene como maximo un codigo no consumido: lo garantiza el indice unico filtrado.
-- Un codigo vencido sigue ocupando el indice, porque un indice filtrado de SQL Server no admite
-- funciones no deterministas como SYSUTCDATETIME(); por eso el codigo anterior se invalida antes
-- de insertar uno nuevo.
-- El codigo nunca se guarda en texto plano: en codigo_hash se persiste el hash argon2id.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.codigo_confirmacion', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.codigo_confirmacion (
        uuid            UNIQUEIDENTIFIER NOT NULL,
        uuid_usuario    UNIQUEIDENTIFIER NOT NULL,
        codigo_hash     NVARCHAR(512)    NOT NULL,
        expira_en       DATETIME2(3)     NOT NULL,
        intentos        INT              NOT NULL CONSTRAINT DF_codigo_confirmacion_intentos DEFAULT 0,
        invalidado      BIT              NOT NULL CONSTRAINT DF_codigo_confirmacion_invalidado DEFAULT 0,
        usado_en        DATETIME2(3)     NULL,
        fecha_creacion  DATETIME2(3)     NOT NULL CONSTRAINT DF_codigo_confirmacion_fecha_creacion DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_codigo_confirmacion PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT FK_codigo_confirmacion_usuario FOREIGN KEY (uuid_usuario) REFERENCES dbo.usuario (uuid)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.codigo_confirmacion') AND name = 'UX_codigo_confirmacion_usuario'
)
BEGIN
    CREATE UNIQUE INDEX UX_codigo_confirmacion_usuario
        ON dbo.codigo_confirmacion (uuid_usuario)
        WHERE usado_en IS NULL AND invalidado = 0;
END
GO
