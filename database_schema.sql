-- ==========================================
-- CHOLOBOT DATABASE SCHEMA (SUPABASE/POSTGRES)
-- ==========================================

-- 1. Sucursales
CREATE TABLE sucursales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    direccion TEXT,
    telefono TEXT,
    horarios JSONB, -- Formato: { "lunes": { "apertura": "09:00", "cierre": "20:00" }, ... }
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Barberos
CREATE TABLE barberos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id UUID REFERENCES sucursales(id),
    nombre TEXT NOT NULL,
    foto_url TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Servicios
CREATE TABLE servicios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    duracion_minutos INTEGER NOT NULL DEFAULT 30,
    precio DECIMAL(10,2),
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Citas (Appointments)
CREATE TABLE citas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id UUID REFERENCES sucursales(id),
    barbero_id UUID REFERENCES barberos(id),
    servicio_id UUID REFERENCES servicios(id),
    cliente_nombre TEXT NOT NULL,
    cliente_telefono TEXT NOT NULL,
    timestamp_inicio TIMESTAMPTZ NOT NULL,
    timestamp_fin TIMESTAMPTZ NOT NULL,
    estado TEXT DEFAULT 'confirmada', -- confirmada, cancelada, completada
    origen TEXT DEFAULT 'whatsapp',
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraint para evitar doble agendamiento del mismo barbero a la misma hora
    CONSTRAINT unique_cita_activa UNIQUE (barbero_id, timestamp_inicio)
);

-- 5. Bloqueos (Unavailability)
CREATE TABLE bloqueos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbero_id UUID REFERENCES barberos(id),
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    motivo TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Fotos de Cortes (Portfolio)
CREATE TABLE fotos_cortes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    barbero_id UUID REFERENCES barberos(id),
    servicio_id UUID REFERENCES servicios(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Logs de Requerimientos (Metrics)
CREATE TABLE request_logs (
    id UUID PRIMARY KEY,
    timestamp BIGINT NOT NULL,
    session_id TEXT NOT NULL,
    phone TEXT,
    input_preview TEXT,
    output_preview TEXT,
    latency_ms INTEGER,
    tools_used JSONB,
    error TEXT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Historial de Chat (LangChain Memory)
CREATE TABLE n8n_chat_histories (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    message JSONB NOT NULL
);

-- ==========================================
-- VISTAS (VIEWS)
-- ==========================================

-- Vista para tendencias de servicios
CREATE OR REPLACE VIEW vista_tendencias_servicios AS
SELECT 
    s.nombre as servicio,
    COUNT(c.id) as total_citas,
    MAX(c.created_at) as ultimo_agendamiento
FROM servicios s
JOIN citas c ON s.id = c.servicio_id
GROUP BY s.nombre
ORDER BY total_citas DESC;

-- Vista de disponibilidad hoy (Ejemplo de lógica de slots)
CREATE OR REPLACE VIEW vista_disponibilidad_hoy AS
SELECT 
    b.id as barbero_id,
    b.nombre as barbero_nombre,
    slots.slot_inicio
FROM barberos b
CROSS JOIN (
    -- Generar slots de 30 min para el día actual
    -- Nota: Esto es una simplificación, la lógica real depende de los horarios de sucursal
    SELECT generate_series(
        current_date + time '09:00',
        current_date + time '20:00',
        interval '30 minutes'
    ) as slot_inicio
) slots
WHERE b.activo = true
AND NOT EXISTS (
    SELECT 1 FROM citas c 
    WHERE c.barbero_id = b.id 
    AND c.timestamp_inicio = slots.slot_inicio
    AND c.estado = 'confirmada'
)
AND NOT EXISTS (
    SELECT 1 FROM bloqueos bl
    WHERE bl.barbero_id = b.id
    AND bl.fecha = current_date
    AND slots.slot_inicio::time >= bl.hora_inicio
    AND slots.slot_inicio::time < bl.hora_fin
);
