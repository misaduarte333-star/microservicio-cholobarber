-- ============================================================================
-- Migration 006: Fix RLS policies for custom auth (bcrypt login)
--
-- The app uses custom authentication (bcrypt password comparison) instead of
-- Supabase Auth (auth.uid()). The policies from migration 005 used auth.uid()
-- which doesn't work with our custom auth flow and caused infinite recursion
-- on usuarios_admin.
--
-- Strategy:
--   - usuarios_admin: allow anon SELECT for login, service_role for all
--   - barberos: allow anon SELECT for login + public booking, service_role for all
--   - Other tables: allow anon read for public-facing features, service_role for all
--   - All write operations require service_role (API routes use it)
-- ============================================================================

-- ─── Drop broken policies from migration 005 ───
DROP POLICY IF EXISTS "sucursales_tenant_isolation" ON sucursales;
DROP POLICY IF EXISTS "barberos_tenant_isolation" ON barberos;
DROP POLICY IF EXISTS "servicios_tenant_isolation" ON servicios;
DROP POLICY IF EXISTS "citas_tenant_isolation" ON citas;
DROP POLICY IF EXISTS "bloqueos_tenant_isolation" ON bloqueos;
DROP POLICY IF EXISTS "usuarios_admin_tenant_isolation" ON usuarios_admin;
DROP POLICY IF EXISTS "costos_fijos_tenant_isolation" ON costos_fijos;
DROP POLICY IF EXISTS "sucursales_public_read" ON sucursales;
DROP POLICY IF EXISTS "servicios_public_read" ON servicios;
DROP POLICY IF EXISTS "barberos_public_read" ON barberos;
DROP POLICY IF EXISTS "citas_public_insert" ON citas;

-- ─── Enable RLS on all tables ───
ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE barberos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueos ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE costos_fijos ENABLE ROW LEVEL SECURITY;

-- ─── usuarios_admin ───
-- Anon can read (needed for login endpoint to verify credentials)
CREATE POLICY "usuarios_admin_anon_read" ON usuarios_admin
  FOR SELECT USING (true);
-- Service role can do everything (create, update, delete via API routes)
CREATE POLICY "usuarios_admin_service_write" ON usuarios_admin
  FOR ALL USING (auth.role() = 'service_role');

-- ─── barberos ───
-- Anon can read (needed for login + public booking page)
CREATE POLICY "barberos_anon_read" ON barberos
  FOR SELECT USING (true);
-- Service role can do everything
CREATE POLICY "barberos_service_write" ON barberos
  FOR ALL USING (auth.role() = 'service_role');

-- ─── sucursales ───
-- Anon can read (needed for booking page + admin dashboard)
CREATE POLICY "sucursales_anon_read" ON sucursales
  FOR SELECT USING (true);
-- Service role can do everything
CREATE POLICY "sucursales_service_write" ON sucursales
  FOR ALL USING (auth.role() = 'service_role');

-- ─── servicios ───
-- Anon can read (needed for booking page + admin dashboard)
CREATE POLICY "servicios_anon_read" ON servicios
  FOR SELECT USING (true);
-- Service role can do everything
CREATE POLICY "servicios_service_write" ON servicios
  FOR ALL USING (auth.role() = 'service_role');

-- ─── citas ───
-- Anon can read (needed for admin dashboard, tablet view)
CREATE POLICY "citas_anon_read" ON citas
  FOR SELECT USING (true);
-- Anon can insert (needed for public booking page)
CREATE POLICY "citas_anon_insert" ON citas
  FOR INSERT WITH CHECK (true);
-- Anon can update (needed for tablet to update status)
CREATE POLICY "citas_anon_update" ON citas
  FOR UPDATE USING (true);
-- Service role can do everything
CREATE POLICY "citas_service_all" ON citas
  FOR ALL USING (auth.role() = 'service_role');

-- ─── bloqueos ───
-- Anon can read (needed for booking validation + admin)
CREATE POLICY "bloqueos_anon_read" ON bloqueos
  FOR SELECT USING (true);
-- Service role can do everything
CREATE POLICY "bloqueos_service_write" ON bloqueos
  FOR ALL USING (auth.role() = 'service_role');

-- ─── costos_fijos ───
-- Anon can read (needed for admin reports)
CREATE POLICY "costos_fijos_anon_read" ON costos_fijos
  FOR SELECT USING (true);
-- Service role can do everything
CREATE POLICY "costos_fijos_service_write" ON costos_fijos
  FOR ALL USING (auth.role() = 'service_role');
