-- ============================================================================
-- MIGRATION: Fase 1 - Sistema de Slots Configurables por Duración de Servicio
-- ============================================================================
-- Fecha: 16 de Abril, 2026
-- Descripción: Agregar soporte para configurar slots según duración de servicios
--              respetando bloques de 30 minutos (:00 y :30 solamente)

-- 1. Agregar columna slot_booking_mode a sucursales
ALTER TABLE sucursales ADD COLUMN 
  slot_booking_mode VARCHAR(50) DEFAULT 'by_service'
  CHECK(slot_booking_mode IN ('fixed_30min', 'fixed_1hour', 'by_service'));

COMMENT ON COLUMN sucursales.slot_booking_mode IS 
'Modo de carga de slots: 
 - fixed_30min: todos los slots son 30 minutos (comportamiento histórico)
 - fixed_1hour: todos los slots son 1 hora
 - by_service: duración según el servicio (recomendado)';

-- 2. Nota: servicios.duracion_minutos EXISTE y se usa para planificar slots
-- Esta es la duración ESPERADA/PLANEADA del servicio

-- 3. Nota: citas.duracion_real_minutos EXISTE pero se usa SOLO DESPUÉS del servicio
-- Este campo almacena cuánto tiempo REALMENTE duró el servicio (post-servicio)
-- NO se usa para calcular disponibilidad ni plaficar slots

-- 4. Agregar timestamp para auditoria
ALTER TABLE sucursales ADD COLUMN 
  slot_config_updated_at TIMESTAMP DEFAULT NOW();

-- 5. Seed: Validar que todos los servicios existentes tengan duración
-- (Esto es informativo, la columna ya existe)
-- SELECT COUNT(*) FROM servicios WHERE duracion_minutos IS NULL;

-- 6. Seed: Validar que todas las citas tengan duración real
-- (Esto es informativo, la columna ya existe)
-- SELECT COUNT(*) FROM citas WHERE duracion_real_minutos IS NULL;
