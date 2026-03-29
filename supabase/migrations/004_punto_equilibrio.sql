-- ============================================================================
-- Migration: 004_punto_equilibrio
-- ============================================================================

-- 1. Add 'costo_directo' to 'servicios'
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS costo_directo DECIMAL(10,2) DEFAULT 0.00;

-- 2. Create 'costos_fijos' table
CREATE TABLE IF NOT EXISTS costos_fijos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sucursal_id UUID REFERENCES sucursales(id) ON DELETE CASCADE,
  mes VARCHAR(7) NOT NULL, -- e.g. '2026-02'
  categoria VARCHAR(100) NOT NULL,
  monto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(sucursal_id, mes, categoria) -- Ensure no duplicates per category per month
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE costos_fijos ENABLE ROW LEVEL SECURITY;

-- Development policy
CREATE POLICY "Allow all for authenticated users" ON costos_fijos
  FOR ALL USING (true);

-- Trigger for auto-updating updated_at
CREATE TRIGGER update_costos_fijos_updated_at
    BEFORE UPDATE ON costos_fijos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
