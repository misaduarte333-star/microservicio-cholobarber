import { EvolutionConfig } from '../../businesses/business-context.interface';
import { validarHoraTool } from './time-validator.langchain';
import {
  makeConsultarServiciosTool,
  makeConsultarBarberosTool,
  makeConsultarSucursalTool,
  makeConsultarBloqueosTool,
  makeConsultarTendenciasTool,
  makeEnviarFotosCortesTool,
} from './business.tools';
import { makeDisponibilidadHoyTool, makeDisponibilidadOtroDiaTool } from './availability.tools';
import {
  makeAgendarCitaTool,
  makeCancelarCitaTool,
  makeMoverCitaTool,
  makeMisCitasTool,
} from './appointment.tools';

/**
 * Builds the full set of LangChain tools scoped to a single tenant.
 * @param sucursalId  UUID of the sucursal — all DB queries will be filtered by this value.
 * @param evolutionConfig  Evolution API config for the tenant — used by Enviar_Fotos_Cortes.
 * @param timezone  IANA timezone string for this tenant (default: America/Hermosillo).
 */
export function makeAllTools(
  sucursalId: string,
  evolutionConfig: EvolutionConfig,
  timezone = 'America/Hermosillo',
) {
  return [
    makeConsultarServiciosTool(sucursalId),
    makeConsultarBarberosTool(sucursalId),
    makeConsultarSucursalTool(sucursalId),
    makeConsultarBloqueosTool(sucursalId),
    makeConsultarTendenciasTool(sucursalId),
    makeEnviarFotosCortesTool(sucursalId, evolutionConfig),
    makeDisponibilidadHoyTool(sucursalId, timezone),
    makeDisponibilidadOtroDiaTool(sucursalId),
    makeAgendarCitaTool(sucursalId),
    makeCancelarCitaTool(sucursalId),
    makeMoverCitaTool(sucursalId),
    makeMisCitasTool(sucursalId),
    validarHoraTool, // stateless — no DB access
  ];
}

export * from './business.tools';
export * from './availability.tools';
export * from './appointment.tools';
export { validarHoraTool } from './time-validator.langchain';
