-- Esquema del microservicio de login sobre SQL Server.
-- Los bloques son idempotentes: pueden ejecutarse varias veces sin duplicar objetos.
-- Convencion: las fechas se almacenan en UTC (SYSUTCDATETIME) y los identificadores
-- de sesion se generan en la aplicacion para que el registro de la base y el de los
-- logs de aplicacion compartan el mismo valor.
--
-- QUOTED_IDENTIFIER y ANSI_NULLS se activan de forma explicita porque sqlcmd los deja
-- desactivados y el indice filtrado de log_session los exige en ON. Asi el archivo se aplica
-- igual con sqlcmd que a traves del script de la aplicacion.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.usuario', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.usuario (
        uuid               UNIQUEIDENTIFIER NOT NULL,
        Email              NVARCHAR(256)    NOT NULL,
        pass_hash          NVARCHAR(512)    NOT NULL,
        estado             CHAR(1)          NOT NULL CONSTRAINT DF_usuario_estado DEFAULT 'C',
        fecha_creacion     DATETIME2(3)     NOT NULL CONSTRAINT DF_usuario_fecha_creacion DEFAULT SYSUTCDATETIME(),
        fecha_modificacion DATETIME2(3)     NOT NULL CONSTRAINT DF_usuario_fecha_modificacion DEFAULT SYSUTCDATETIME(),
        tyc                BIT              NOT NULL CONSTRAINT DF_usuario_tyc DEFAULT 0,
        CONSTRAINT PK_usuario PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT CK_usuario_estado CHECK (estado IN ('A', 'I', 'C', 'D'))
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.usuario') AND name = 'UX_usuario_email'
)
BEGIN
    CREATE UNIQUE INDEX UX_usuario_email ON dbo.usuario (Email);
END
GO

IF OBJECT_ID('dbo.log_session', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.log_session (
        uuid               UNIQUEIDENTIFIER NOT NULL,
        uuid_usuario       UNIQUEIDENTIFIER NOT NULL,
        successful         BIT              NOT NULL,
        timestamp_intento  DATETIME2(3)     NOT NULL CONSTRAINT DF_log_session_timestamp DEFAULT SYSUTCDATETIME(),
        refresh_token_hash CHAR(64)         NULL,
        refresh_expires_at DATETIME2(3)     NULL,
        revoked_at         DATETIME2(3)     NULL,
        rotado_en          DATETIME2(3)     NULL,
        CONSTRAINT PK_log_session PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT FK_log_session_usuario FOREIGN KEY (uuid_usuario) REFERENCES dbo.usuario (uuid)
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.log_session') AND name = 'IX_log_session_usuario_fecha'
)
BEGIN
    CREATE INDEX IX_log_session_usuario_fecha ON dbo.log_session (uuid_usuario, timestamp_intento DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.log_session') AND name = 'UX_log_session_refresh_hash'
)
BEGIN
    CREATE UNIQUE INDEX UX_log_session_refresh_hash
        ON dbo.log_session (refresh_token_hash)
        WHERE refresh_token_hash IS NOT NULL;
END
GO

IF OBJECT_ID('dbo.api_key', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.api_key (
        uuid               UNIQUEIDENTIFIER NOT NULL,
        key_hash           CHAR(64)         NOT NULL,
        nombre             NVARCHAR(128)    NOT NULL,
        tipo_cliente       CHAR(8)          NOT NULL,
        permisos           NVARCHAR(512)    NOT NULL,
        revocado           BIT              NOT NULL CONSTRAINT DF_api_key_revocado DEFAULT 0,
        fecha_creacion     DATETIME2(3)     NOT NULL CONSTRAINT DF_api_key_fecha_creacion DEFAULT SYSUTCDATETIME(),
        fecha_modificacion DATETIME2(3)     NOT NULL CONSTRAINT DF_api_key_fecha_modificacion DEFAULT SYSUTCDATETIME(),
        ultimo_uso         DATETIME2(3)     NULL,
        CONSTRAINT PK_api_key PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT CK_api_key_tipo_cliente CHECK (tipo_cliente IN ('mobile', 'web-bff', 'web'))
    );
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.api_key') AND name = 'UX_api_key_key_hash'
)
BEGIN
    CREATE UNIQUE INDEX UX_api_key_key_hash ON dbo.api_key (key_hash);
END
GO
