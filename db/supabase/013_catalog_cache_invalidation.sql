-- ========================================================================================
-- BarberCloud AI Cache Trigger
-- Propósito: Informar al servidor Next.js cuando cambian los servicios o los barberos
-- para que elimine el caché inmortal de Redis de la Sucursal afectada.
-- Requiere tener activado pgsodium/pg_net en supabase (generalmente activo por defecto)
-- ========================================================================================

-- NOTA IMPORTANTE: Reemplaza "https://tu-dominio.com" con tu URL real en producción.
-- Para desarrollo local (tunneling), pon la URL de ngrok/localtunnel de tu Next.js
CREATE OR REPLACE FUNCTION notify_catalog_cache_invalidation()
RETURNS TRIGGER AS $$
DECLARE
    affected_sucursal_id UUID;
    webhook_url TEXT := 'https://cholobot-microservicio.ada8bf.easypanel.host/api/webhook/cache';
    payload JSONB;
BEGIN
    -- Capturar el sucursal_id independientemente del tipo de evento (INSERT/UPDATE/DELETE)
    IF TG_OP = 'DELETE' THEN
        affected_sucursal_id := OLD.sucursal_id;
    ELSE
        affected_sucursal_id := NEW.sucursal_id;
    END IF;

    -- Construimos el payload JSON
    payload := json_build_object(
        'sucursal_id', affected_sucursal_id,
        'tabla_modificada', TG_TABLE_NAME,
        'timestamp', now()
    );

    -- Enviamos la peticion POST al servidor NextJS de manera asíncrona (usando pg_net si está habilitado)
    -- Si no tienes pg_net instalado en local, este trigger fallará. Si estás en Supabase Hosting sí funcionará.
    PERFORM net.http_post(
        url := webhook_url,
        body := payload,
        headers := '{"Content-Type": "application/json"}'::jsonb
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Silenciar error si pg_net no está habilitado para no bloquear la BD, 
    -- solo se registrará en el postgres log.
    RAISE WARNING 'Fallo al invocar webhook de invalidacion: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Trigger para tabla SERVICIOS
DROP TRIGGER IF EXISTS trg_invalidate_cache_servicios ON servicios;
CREATE TRIGGER trg_invalidate_cache_servicios
AFTER INSERT OR UPDATE OR DELETE ON servicios
FOR EACH ROW EXECUTE FUNCTION notify_catalog_cache_invalidation();

-- 2. Trigger para tabla BARBEROS
DROP TRIGGER IF EXISTS trg_invalidate_cache_barberos ON barberos;
CREATE TRIGGER trg_invalidate_cache_barberos
AFTER INSERT OR UPDATE OR DELETE ON barberos
FOR EACH ROW EXECUTE FUNCTION notify_catalog_cache_invalidation();

SELECT 'Triggers de invalidación de caché instalados correctamente.' as console_log;
