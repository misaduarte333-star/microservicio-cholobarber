import { makeDisponibilidadHoyTool, makeDisponibilidadOtroDiaTool, makeValidarHoraTool } from './availability.tools'
import { makeBuscarOCrearClienteTool, makeMisCitasTool, makeAgendarCitaTool, makeCancelarCitaTool } from './appointment.tools'
import { makeConsultarSucursalTool, makeConsultarBarberosTool, makeConsultarServiciosTool } from './business.tools'

/**
 * Builds the set of real-time LangChain tools scoped to a single tenant (sucursal).
 * Static data (barberos, servicios, sucursal) is pre-loaded into the system prompt,
 * but business tools are included as fallback for real-time queries.
 */
export function makeAllTools(sucursalId: string, timezone: string = 'America/Hermosillo') {
    return [
        // Validación y disponibilidad (tiempo real)
        makeValidarHoraTool(timezone),
        makeDisponibilidadHoyTool(sucursalId, timezone),
        makeDisponibilidadOtroDiaTool(sucursalId, timezone),

        // Gestión de citas y CRM (tiempo real)
        makeBuscarOCrearClienteTool(sucursalId),
        makeMisCitasTool(sucursalId),
        makeAgendarCitaTool(sucursalId),
        makeCancelarCitaTool(sucursalId),

        // Consulta de negocio (fallback si datos pre-cargados no son suficientes)
        makeConsultarSucursalTool(sucursalId),
        makeConsultarBarberosTool(sucursalId),
        makeConsultarServiciosTool(sucursalId),
    ]
}

export * from './business.tools'
export * from './availability.tools'
export * from './appointment.tools'
