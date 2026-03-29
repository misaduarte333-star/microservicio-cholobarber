-- ============================================================================
-- Migration 005: Optimizaciones (Indexes, RLS, Timezone, RPC Transaction)
-- ============================================================================

-- ============================================================================
-- 1. ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- For overlap validation (most critical query)
CREATE INDEX IF NOT EXISTS idx_citas_barbero_estado_fechas
  ON citas(barbero_id, estado, timestamp_inicio, timestamp_fin);

-- For dashboard and reports filtering by sucursal + estado + date
CREATE INDEX IF NOT EXISTS idx_citas_sucursal_estado_fecha
  ON citas(sucursal_id, estado, timestamp_inicio);

-- For barber listings filtered by active status
CREATE INDEX IF NOT EXISTS idx_barberos_sucursal_activo
  ON barberos(sucursal_id, activo);

-- For service listings filtered by active status
CREATE INDEX IF NOT EXISTS idx_servicios_sucursal_activo
  ON servicios(sucursal_id, activo);

-- For block lookups during validation
CREATE INDEX IF NOT EXISTS idx_bloqueos_sucursal_fechas
  ON bloqueos(sucursal_id, fecha_inicio, fecha_fin);

-- ============================================================================
-- 2. TIMEZONE SUPPORT FOR SUCURSALES
-- ============================================================================

ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Hermosillo';

-- ============================================================================
-- 3. RLS POLICIES - PRODUCTION MULTI-TENANT ISOLATION
-- ============================================================================

-- Drop permissive development policies
DROP POLICY IF EXISTS "Allow all for authenticated users" ON sucursales;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON barberos;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON servicios;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON citas;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON bloqueos;
DROP POLICY IF EXISTS "Allow all for authenticated users" ON usuarios_admin;

-- Sucursales: admins can see their own branch, service role can see all
CREATE POLICY "sucursales_tenant_isolation" ON sucursales
  FOR ALL USING (
    id IN (
      SELECT sucursal_id FROM usuarios_admin WHERE id = auth.uid()
      UNION
      SELECT sucursal_id FROM barberos WHERE id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Barberos: only visible within same branch
CREATE POLICY "barberos_tenant_isolation" ON barberos
  FOR ALL USING (
    sucursal_id IN (
      SELECT sucursal_id FROM usuarios_admin WHERE id = auth.uid()
      UNION
      SELECT sucursal_id FROM barberos WHERE id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Servicios: only visible within same branch
CREATE POLICY "servicios_tenant_isolation" ON servicios
  FOR ALL USING (
    sucursal_id IN (
      SELECT sucursal_id FROM usuarios_admin WHERE id = auth.uid()
      UNION
      SELECT sucursal_id FROM barberos WHERE id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Citas: only visible within same branch
CREATE POLICY "citas_tenant_isolation" ON citas
  FOR ALL USING (
    sucursal_id IN (
      SELECT sucursal_id FROM usuarios_admin WHERE id = auth.uid()
      UNION
      SELECT sucursal_id FROM barberos WHERE id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Bloqueos: only visible within same branch
CREATE POLICY "bloqueos_tenant_isolation" ON bloqueos
  FOR ALL USING (
    sucursal_id IN (
      SELECT sucursal_id FROM usuarios_admin WHERE id = auth.uid()
      UNION
      SELECT sucursal_id FROM barberos WHERE id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Usuarios_admin: admins can only see their own record
CREATE POLICY "usuarios_admin_tenant_isolation" ON usuarios_admin
  FOR ALL USING (
    id = auth.uid()
    OR sucursal_id IN (
      SELECT sucursal_id FROM usuarios_admin WHERE id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );

-- Allow anon access to sucursales for public booking page (read-only)
CREATE POLICY "sucursales_public_read" ON sucursales
  FOR SELECT USING (activa = true);

-- Allow anon access to servicios for public booking (read-only)
CREATE POLICY "servicios_public_read" ON servicios
  FOR SELECT USING (activo = true);

-- Allow anon access to barberos for public booking (read-only)
CREATE POLICY "barberos_public_read" ON barberos
  FOR SELECT USING (activo = true);

-- Allow anon insert on citas for public booking
CREATE POLICY "citas_public_insert" ON citas
  FOR INSERT WITH CHECK (true);

-- ============================================================================
-- 4. RPC: ATOMIC COST REPLACEMENT (Transaction)
-- ============================================================================

CREATE OR REPLACE FUNCTION reemplazar_costos_fijos(
  p_sucursal_id UUID,
  p_mes TEXT,
  p_costos JSONB
) RETURNS void AS $$
BEGIN
  -- Delete existing costs for the month
  DELETE FROM costos_fijos
  WHERE sucursal_id = p_sucursal_id AND mes = p_mes;

  -- Insert new costs (if any)
  IF jsonb_array_length(p_costos) > 0 THEN
    INSERT INTO costos_fijos (sucursal_id, mes, categoria, monto)
      SELECT p_sucursal_id, p_mes, c->>'categoria', (c->>'monto')::numeric
      FROM jsonb_array_elements(p_costos) AS c;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. ENABLE RLS ON COSTOS_FIJOS (if not already)
-- ============================================================================

ALTER TABLE costos_fijos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "costos_fijos_tenant_isolation" ON costos_fijos
  FOR ALL USING (
    sucursal_id IN (
      SELECT sucursal_id FROM usuarios_admin WHERE id = auth.uid()
    )
    OR auth.role() = 'service_role'
  );
