-- Pin de acceso de la cuenta.
--
-- El pin lo escribe la persona en la aplicacion movil y se compara en el dispositivo, de modo que
-- nunca viaja al servidor en cada apertura. Aqui se guarda un verificador para tres cosas:
-- poder cambiarlo o revocarlo desde otro dispositivo, y usarlo como segundo factor cuando la
-- aplicacion pide una confirmacion antes de una operacion sensible.
--
-- El verificador se genera con argon2id, el mismo algoritmo de las contrasenas de usuario.
-- Los bloques son idempotentes: pueden ejecutarse varias veces sin duplicar objetos.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.pin_acceso', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.pin_acceso (
        uuid               UNIQUEIDENTIFIER NOT NULL,
        uuid_usuario       UNIQUEIDENTIFIER NOT NULL,
        dispositivo        NVARCHAR(128)   NOT NULL,
        hash               NVARCHAR(512)   NOT NULL,
        intentos_fallidos  INT             NOT NULL CONSTRAINT DF_pin_acceso_intentos DEFAULT 0,
        revocado           BIT             NOT NULL CONSTRAINT DF_pin_acceso_revocado DEFAULT 0,
        fecha_creacion     DATETIME2(3)    NOT NULL CONSTRAINT DF_pin_acceso_fecha_creacion DEFAULT SYSUTCDATETIME(),
        fecha_modificacion DATETIME2(3)    NOT NULL CONSTRAINT DF_pin_acceso_fecha_modificacion DEFAULT SYSUTCDATETIME(),
        ultimo_uso         DATETIME2(3)    NULL,
        CONSTRAINT PK_pin_acceso PRIMARY KEY CLUSTERED (uuid),
        CONSTRAINT FK_pin_acceso_usuario FOREIGN KEY (uuid_usuario) REFERENCES dbo.usuario (uuid)
    );
END
GO

-- Una sola fila de pin activo por cuenta. Las filas revocadas se conservan como historial.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.pin_acceso') AND name = 'UX_pin_acceso_usuario'
)
BEGIN
    CREATE UNIQUE INDEX UX_pin_acceso_usuario
        ON dbo.pin_acceso (uuid_usuario)
        WHERE revocado = 0;
END
GO
