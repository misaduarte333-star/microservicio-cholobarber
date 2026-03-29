// ============================================================================
// BarberCloud AI - Type Definitions
// ============================================================================

// Schedule Types (used in JSONB columns)
/**
 * Define las horas de apertura y cierre de un día de la semana
 */
export interface HorarioDia {
    apertura: string  // "09:00"
    cierre: string    // "19:00"
}

export interface HorarioLaboral {
    inicio: string  // "09:00"
    fin: string     // "18:00"
}

export interface BloqueAlmuerzo {
    inicio: string  // "14:00"
    fin: string     // "15:00"
}

export type DiasSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo'

export type HorarioApertura = Partial<Record<DiasSemana, HorarioDia>>
export type HorarioLaboralSemana = Partial<Record<DiasSemana, HorarioLaboral>>

// Enums
export type OrigenCita = 'whatsapp' | 'walkin'
export type EstadoCita = 'confirmada' | 'en_espera' | 'en_proceso' | 'finalizada' | 'cancelada' | 'no_show'
export type TipoBloqueo = 'almuerzo' | 'vacaciones' | 'dia_festivo' | 'emergencia'
export type RolAdmin = 'admin' | 'secretaria'

// ============================================================================
// Database Row Types
// ============================================================================

export interface Sucursal {
    id: string
    nombre: string
    slug: string | null
    plan: string
    direccion: string | null
    telefono_whatsapp: string
    google_maps_url: string | null
    ubicacion: string | null
    telefono_fijo: string | null
    email_contacto: string | null
    instagram_url: string | null
    zona_ubicacion: string | null
    horario_apertura: HorarioApertura
    timezone: string
    activa: boolean
    created_at: string
}

export interface Barbero {
    id: string
    sucursal_id: string
    nombre: string
    estacion_id: number
    usuario_tablet: string
    password_hash: string
    horario_laboral: HorarioLaboralSemana
    bloqueo_almuerzo: BloqueAlmuerzo | null
    activo: boolean
    hora_entrada: string | null
    created_at: string
}

export interface Servicio {
    id: string
    sucursal_id: string
    nombre: string
    duracion_minutos: number
    precio: number
    costo_directo?: number
    activo: boolean
    created_at: string
}

export interface CostoFijo {
    id: string
    sucursal_id: string
    mes: string
    categoria: string
    monto: number
    created_at: string
    updated_at: string
}

/**
 * Tabla: citas
 * Maneja todas las reservas de cortes, tanto por WhatsApp como físicamente (walkins)
 */
export interface Cita {
    id: string
    sucursal_id: string
    barbero_id: string
    servicio_id: string | null
    cliente_nombre: string
    cliente_telefono: string
    timestamp_inicio: string
    timestamp_fin: string
    origen: OrigenCita
    estado: EstadoCita
    notas: string | null
    recordatorio_24h_enviado: boolean
    recordatorio_1h_enviado: boolean
    created_at: string
    updated_at: string
}

export interface Bloqueo {
    id: string
    barbero_id: string | null
    sucursal_id: string
    fecha_inicio: string
    fecha_fin: string
    tipo: TipoBloqueo
    motivo: string | null
    created_at: string
}

export interface UsuarioAdmin {
    id: string
    sucursal_id: string
    nombre: string
    email: string
    password_hash: string
    rol: RolAdmin
    activo: boolean
    created_at: string
}

// ============================================================================
// Joined/Extended Types (for queries with relations)
// ============================================================================

/**
 * Extensión de la tabla Citas incluyendo sus relaciones para mayor facilidad en las queries de front-end
 */
export interface CitaConRelaciones extends Cita {
    servicio?: Servicio
    barbero?: Barbero
    sucursal?: Sucursal
}

export interface BarberoConSucursal extends Barbero {
    sucursal?: Sucursal
}

// ============================================================================
// API/Form Types
// ============================================================================

/**
 * Tipo usado para la creación inicial de una cita desde la API o un Formulario
 */
export interface CrearCitaInput {
    sucursal_id: string
    barbero_id: string
    servicio_id: string
    cliente_nombre: string
    cliente_telefono: string
    timestamp_inicio: string
    origen: OrigenCita
    notas?: string
}

export interface ValidacionResultado {
    valido: boolean
    mensaje?: string
    alternativas?: string[]  // ISO timestamps
}

// ============================================================================
// UI State Types
// ============================================================================

export interface KPIs {
    citasHoy: number
    completadas: number
    ingresos: number
    noShows: number
    tendencias: {
        citasHoy: number
        completadas: number
        ingresos: number
        noShows: number
    }
}

export interface FiltrosCitas {
    fecha?: string      // YYYY-MM-DD
    barbero_id?: string
    estado?: EstadoCita
}

// ============================================================================
// Supabase Database Type (for client type safety)
// ============================================================================

/**
 * Tipado principal de la base de datos de Supabase. Provee autocompletado y validación de tipos 
 * para todas las tablas de la aplicación.
 */
export interface Database {
    public: {
        Tables: {
            sucursales: {
                Row: Sucursal
                Insert: Omit<Sucursal, 'id' | 'created_at'>
                Update: Partial<Omit<Sucursal, 'id' | 'created_at'>>
                Relationships: []
            }
            barberos: {
                Row: Barbero
                Insert: Omit<Barbero, 'id' | 'created_at'>
                Update: Partial<Omit<Barbero, 'id' | 'created_at'>>
                Relationships: []
            }
            servicios: {
                Row: Servicio
                Insert: Omit<Servicio, 'id' | 'created_at'>
                Update: Partial<Omit<Servicio, 'id' | 'created_at'>>
                Relationships: []
            }
            citas: {
                Row: Cita
                Insert: Omit<Cita, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<Cita, 'id' | 'created_at'>>
                Relationships: []
            }
            bloqueos: {
                Row: Bloqueo
                Insert: Omit<Bloqueo, 'id' | 'created_at'>
                Update: Partial<Omit<Bloqueo, 'id' | 'created_at'>>
                Relationships: []
            }
            usuarios_admin: {
                Row: UsuarioAdmin
                Insert: Omit<UsuarioAdmin, 'id' | 'created_at'>
                Update: Partial<Omit<UsuarioAdmin, 'id' | 'created_at'>>
                Relationships: []
            }
            costos_fijos: {
                Row: CostoFijo
                Insert: Omit<CostoFijo, 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Omit<CostoFijo, 'id' | 'created_at'>>
                Relationships: []
            }
        }
        Views: Record<string, never>
        Functions: Record<string, never>
        Enums: Record<string, never>
        CompositeTypes: Record<string, never>
    }
}
