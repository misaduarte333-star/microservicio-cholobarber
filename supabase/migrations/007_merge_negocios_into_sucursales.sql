-- ============================================================================
-- Migration 007: Merge negocios into sucursales
--
-- The "negocios" table is redundant — in practice each negocio has one sucursal
-- and all the system filters by sucursal_id. This migration:
--   1. Adds plan/slug columns to sucursales
--   2. Migrates existing data from negocios
--   3. Drops negocio_id FK from sucursales, barberos, usuarios_admin
--   4. Drops the negocios table
-- ============================================================================

-- ─── 1. Add columns to sucursales ───
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'basico';
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS slug TEXT;

-- ─── 2. Migrate data from negocios ───
UPDATE sucursales s
SET plan = n.plan,
    slug = n.slug
FROM negocios n
WHERE s.negocio_id = n.id;

-- Generate slug for any sucursales that don't have one
UPDATE sucursales
SET slug = lower(replace(replace(nombre, ' ', '-'), '.', ''))
WHERE slug IS NULL;

-- ─── 3. Drop negocio_id foreign keys and columns ───

-- sucursales.negocio_id
ALTER TABLE sucursales DROP CONSTRAINT IF EXISTS sucursales_negocio_id_fkey;
ALTER TABLE sucursales DROP COLUMN IF EXISTS negocio_id;

-- barberos.negocio_id
ALTER TABLE barberos DROP CONSTRAINT IF EXISTS barberos_negocio_id_fkey;
ALTER TABLE barberos DROP COLUMN IF EXISTS negocio_id;

-- usuarios_admin.negocio_id
ALTER TABLE usuarios_admin DROP CONSTRAINT IF EXISTS usuarios_admin_negocio_id_fkey;
ALTER TABLE usuarios_admin DROP COLUMN IF EXISTS negocio_id;

-- ─── 4. Drop negocios table ───
DROP TABLE IF EXISTS negocios CASCADE;
