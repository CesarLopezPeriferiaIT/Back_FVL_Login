-- Esquema del microservicio de login sobre SQL Server.
-- Los bloques son idempotentes: pueden ejecutarse varias veces sin duplicar objetos.
-- Convencion: las fechas se almacenan en UTC (SYSUTCDATETIME) y los identificadores
-- de sesion se generan en la aplicacion para que el registro de la base y el de los
-- logs de aplicacion compartan el mismo valor.

IF OBJECT_ID('dbo.Usuario', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Usuario (
        uuid               UNIQUEIDENTIFIER NOT NULL,
        Email              NVARCHAR(256)    NOT NULL,
        pass_hash          NVARCHAR(512)    NOT NULL,
        estado             CHAR(1)          NOT NULL CONSTRAINT DF_Usuario_estado DEFAULT 'C',
        fecha_creacion     DATETIME2(3)     NOT NULL CONSTRAINT DF_Usuario_fecha_creacion DEFAULT SYSUTCDATETIME(),
        fecha_modificacion DATETIME2(3)     NOT NULL CONSTRAINT DF_Usuario_fecha_modificacion DEFAULT SYSUTCDATETIME(),
        tyc                BIT              NOT NULL CONSTRAINT DF_Usuario_tyc DEFAULT 0,
        CONSTRAINT PK_Usuario PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT CK_Usuario_estado CHECK (estado IN ('A', 'I', 'C', 'D'))
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.Usuario') AND name = 'UX_Usuario_Email'
)
BEGIN
    CREATE UNIQUE INDEX UX_Usuario_Email ON dbo.Usuario (Email);
END
GO

IF OBJECT_ID('dbo.LogSession', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.LogSession (
        uuid               UNIQUEIDENTIFIER NOT NULL,
        uuid_usuario       UNIQUEIDENTIFIER NOT NULL,
        successful         BIT              NOT NULL,
        timestamp_intento  DATETIME2(3)     NOT NULL CONSTRAINT DF_LogSession_timestamp DEFAULT SYSUTCDATETIME(),
        refresh_token_hash CHAR(64)         NULL,
        refresh_expires_at DATETIME2(3)     NULL,
        revoked_at         DATETIME2(3)     NULL,
        rotado_en          DATETIME2(3)     NULL,
        CONSTRAINT PK_LogSession PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT FK_LogSession_Usuario FOREIGN KEY (uuid_usuario) REFERENCES dbo.Usuario (uuid)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.LogSession') AND name = 'IX_LogSession_usuario_fecha'
)
BEGIN
    CREATE INDEX IX_LogSession_usuario_fecha ON dbo.LogSession (uuid_usuario, timestamp_intento DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.LogSession') AND name = 'UX_LogSession_refresh_hash'
)
BEGIN
    CREATE UNIQUE INDEX UX_LogSession_refresh_hash
        ON dbo.LogSession (refresh_token_hash)
        WHERE refresh_token_hash IS NOT NULL;
END
GO

IF OBJECT_ID('dbo.ApiKey', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ApiKey (
        uuid               UNIQUEIDENTIFIER NOT NULL,
        key_hash           CHAR(64)         NOT NULL,
        nombre             NVARCHAR(128)    NOT NULL,
        tipo_cliente       CHAR(8)          NOT NULL,
        permisos           NVARCHAR(512)    NOT NULL,
        revocado           BIT              NOT NULL CONSTRAINT DF_ApiKey_revocado DEFAULT 0,
        fecha_creacion     DATETIME2(3)     NOT NULL CONSTRAINT DF_ApiKey_fecha_creacion DEFAULT SYSUTCDATETIME(),
        fecha_modificacion DATETIME2(3)     NOT NULL CONSTRAINT DF_ApiKey_fecha_modificacion DEFAULT SYSUTCDATETIME(),
        ultimo_uso         DATETIME2(3)     NULL,
        CONSTRAINT PK_ApiKey PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT CK_ApiKey_tipo_cliente CHECK (tipo_cliente IN ('mobile', 'web-bff', 'web'))
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.ApiKey') AND name = 'UX_ApiKey_key_hash'
)
BEGIN
    CREATE UNIQUE INDEX UX_ApiKey_key_hash ON dbo.ApiKey (key_hash);
END
GO
