import { TimeValidator } from './time-validator.tool';

describe('TimeValidator', () => {
  it('Debe redondear y aceptar una hora mayor a 30 mins', () => {
    const result = TimeValidator.validate({
      hora_actual: '15:00', // 3:00 PM
      hora_solicitada: '16:10' // -> redondeará a 16:30
    });
    
    expect(result.status).toBe('VALIDA');
    expect(result.motivo).toBe('ok');
    expect(result.hora_solicitada_24h).toBe('16:30');
  });

  it('Debe rechazar una hora pasada', () => {
    const result = TimeValidator.validate({
      hora_actual: '15:00',
      hora_solicitada: '14:00'
    });
    
    expect(result.status).toBe('RECHAZADA');
    expect(result.motivo).toBe('pasada');
    expect(result.siguiente_bloque).toBe('15:30');
    expect(result.siguiente_bloque_12h).toBe('3:30 PM');
  });

  it('Debe rechazar si faltan menos de 15 minutos', () => {
    const result = TimeValidator.validate({
      hora_actual: '14:50',
      hora_solicitada: '15:00'
    });
    
    expect(result.status).toBe('RECHAZADA');
    expect(result.motivo).toBe('menos_15');
    // Si actual es 14:50, solicitada es 15:00. 15:00 - 14:50 = 10 mins (<15). 
    // Rechazada. Siguiente bloque a partir de 15:00 -> 15:30. 15:30 - 14:50 = 40 mins (>=15). Válido.
    expect(result.siguiente_bloque).toBe('15:30');
  });

  it('Debe advertir si faltan exactamente o menos de 30 minutos (pero mas de 15)', () => {
    const result = TimeValidator.validate({
      hora_actual: '15:00',
      hora_solicitada: '15:30'
    });
    
    expect(result.status).toBe('VALIDA');
    expect(result.advertencia).toBe(true);
    expect(result.motivo).toBe('justo');
    expect(result.hora_solicitada_24h).toBe('15:30');
  });

  it('Debe interpretar heurística (ej. "3" sin pm asume PM)', () => {
    const result = TimeValidator.validate({
      hora_actual: '14:00',
      hora_solicitada: '3'
    });
    
    expect(result.hora_solicitada_24h).toBe('15:00'); // Redondea a 15:00
  });

  it('Debe lidiar con "3pm"', () => {
    const result = TimeValidator.validate({
      hora_actual: '12:00',
      hora_solicitada: '3pm'
    });
    
    expect(result.hora_solicitada_24h).toBe('15:00');
  });
});
