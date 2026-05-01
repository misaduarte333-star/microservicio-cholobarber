-- Migración 018: Añadir lista de números bloqueados por sucursal
-- Estos números nunca recibirán respuesta del agente IA.

ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS blocked_phones TEXT[] DEFAULT '{}';

COMMENT ON COLUMN sucursales.blocked_phones IS 'Lista de números de teléfono (sin @s.whatsapp.net) que el agente IA ignorará permanentemente.';
