-- Migración 015: Añadir flags para recordatorios de citas
-- Permite rastrear qué recordatorios ya han sido enviados proactivamente

ALTER TABLE citas 
ADD COLUMN IF NOT EXISTS recordatorio_15m_enviado BOOLEAN DEFAULT FALSE;

ALTER TABLE citas 
ADD COLUMN IF NOT EXISTS recordatorio_tarde_enviado BOOLEAN DEFAULT FALSE;

-- Documentación de columnas:
-- recordatorio_15m_enviado: Se marca TRUE cuando se envía el recordatorio 15-20 min antes del inicio.
-- recordatorio_tarde_enviado: Se marca TRUE cuando se envía el mensaje de "¿Vas en camino?" 15-20 min después del inicio si la cita sigue 'confirmada'.
