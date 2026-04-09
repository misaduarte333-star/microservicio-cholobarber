-- ========================================================================================
-- Migration 014: Tipo de Prestador de Servicio por Sucursal
-- Agrega el campo tipo_prestador a la tabla sucursales para que el agente use
-- el vocabulario correcto (Barbero, Estilista, Pedicurista, Terapeuta, etc.)
-- ========================================================================================

-- Agregar columna a la tabla sucursales
ALTER TABLE sucursales
    ADD COLUMN IF NOT EXISTS tipo_prestador TEXT NOT NULL DEFAULT 'barbero',
    ADD COLUMN IF NOT EXISTS tipo_prestador_label TEXT NOT NULL DEFAULT 'Barbero';

-- Comentarios de documentación
COMMENT ON COLUMN sucursales.tipo_prestador IS 'Tipo de prestador: barbero | estilista | pedicurista | terapeuta | entrenador | medico | custom';
COMMENT ON COLUMN sucursales.tipo_prestador_label IS 'Etiqueta personalizada que el agente usará para referirse al prestador (ej. "Estilista", "Terapeuta")';

-- Valor por defecto para los negocios existentes (Cholo Barber y similares)
UPDATE sucursales SET tipo_prestador = 'barbero', tipo_prestador_label = 'Barbero' WHERE tipo_prestador IS NULL;

SELECT 'Migración 014 aplicada correctamente.' as console_log;
