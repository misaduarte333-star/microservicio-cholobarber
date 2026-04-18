import { debouncerService } from '../src/lib/ai/debouncer.service';

async function testManualMode() {
    const sucursalId = 'test-sucursal-123';
    const phone = '5211234567890';

    console.log('--- Iniciando Test de Modo Manual ---');

    // 1. Verificar estado inicial
    let isManual = await debouncerService.getManualMode(sucursalId, phone);
    console.log(`Estado Inicial (debe ser false): ${isManual}`);

    // 2. Activar modo manual
    console.log('Activando modo manual...');
    await debouncerService.setManualMode(sucursalId, phone, true);

    // 3. Verificar estado activado
    isManual = await debouncerService.getManualMode(sucursalId, phone);
    console.log(`Estado Activado (debe ser true): ${isManual}`);

    // 4. Desactivar modo manual
    console.log('Desactivando modo manual...');
    await debouncerService.setManualMode(sucursalId, phone, false);

    // 5. Verificar estado final
    isManual = await debouncerService.getManualMode(sucursalId, phone);
    console.log(`Estado Final (debe ser false): ${isManual}`);

    console.log('--- Test Completado ---');
    process.exit(0);
}

testManualMode().catch(err => {
    console.error('Error en el test:', err);
    process.exit(1);
});
