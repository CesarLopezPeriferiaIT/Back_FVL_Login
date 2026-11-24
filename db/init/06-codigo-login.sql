-- Tabla de codigos de acceso por correo.
-- Cada cuenta tiene como maximo un codigo no consumido, garantizado por el indice filtrado.
-- Un codigo vencido sigue ocupando el indice y debe invalidarse antes de insertar uno nuevo.
-- El codigo nunca se guarda en texto plano: en codigo_hash se persiste el hash argon2id.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.codigo_login', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.codigo_login (
        uuid            UNIQUEIDENTIFIER NOT NULL,
        uuid_usuario    UNIQUEIDENTIFIER NOT NULL,
        codigo_hash     NVARCHAR(512)    NOT NULL,
        expira_en       DATETIME2(3)     NOT NULL,
        intentos        INT              NOT NULL CONSTRAINT DF_codigo_login_intentos DEFAULT 0,
        invalidado      BIT              NOT NULL CONSTRAINT DF_codigo_login_invalidado DEFAULT 0,
        usado_en        DATETIME2(3)     NULL,
        fecha_creacion  DATETIME2(3)     NOT NULL CONSTRAINT DF_codigo_login_fecha_creacion DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_codigo_login PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT FK_codigo_login_usuario FOREIGN KEY (uuid_usuario) REFERENCES dbo.usuario (uuid)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.codigo_login') AND name = 'UX_codigo_login_usuario'
)
BEGIN
    CREATE UNIQUE INDEX UX_codigo_login_usuario
        ON dbo.codigo_login (uuid_usuario)
        WHERE usado_en IS NULL AND invalidado = 0;
END
GO
