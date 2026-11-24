-- Catalogo de roles del personal de salud y su area de servicio.
-- Idempotente: crea la tabla si falta e inserta solo los codigos ausentes.
-- codigo: identificador numerico del rol, asignado en el orden de la tabla de parametrizacion.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('dbo.catalogo_rol', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.catalogo_rol (
        codigo        INT           NOT NULL,
        nombre        NVARCHAR(100) NOT NULL,
        area_servicio NVARCHAR(100) NOT NULL,
        CONSTRAINT PK_catalogo_rol PRIMARY KEY CLUSTERED (codigo),
        CONSTRAINT UX_catalogo_rol_nombre UNIQUE (nombre)
    );
END
GO

INSERT INTO dbo.catalogo_rol (codigo, nombre, area_servicio)
SELECT v.codigo, v.nombre, v.area_servicio FROM (VALUES
    (1, N'Medico General',     N'Urgencias'),
    (2, N'Enfermero',          N'Consulta Externa'),
    (3, N'Enfermera/Auxiliar', N'Urgencias/ consulta externa/Sala de partos'),
    (4, N'Ginecólogo',         N'Urgencias/ consulta externa/Sala de partos'),
    (5, N'Partera',            N'Atención a usuario')
) AS v (codigo, nombre, area_servicio)
WHERE NOT EXISTS (SELECT 1 FROM dbo.catalogo_rol r WHERE r.codigo = v.codigo);
GO
