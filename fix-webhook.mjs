import { writeFileSync } from 'fs';

const evoBase = 'https://cholobot-evolution.ada8bf.easypanel.host';
const apikey = '123456.+az1';
const instance = 'barberia';
const correctWebhookUrl = 'http://18.216.112.9:3001/api/webhook/evolution';

const results = {};

console.log('=== DIAGNÓSTICO EVOLUTION API ===');
console.log('Webhook objetivo:', correctWebhookUrl);

// 1. Webhook actual
const findRes = await fetch(`${evoBase}/webhook/find/${instance}`, { headers: { apikey } });
const current = await findRes.json();
results.webhookActual = current;
console.log('\n[1] Webhook actual:\n', JSON.stringify(current, null, 2));

// 2. Forzar actualización
const setRes = await fetch(`${evoBase}/webhook/set/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey },
    body: JSON.stringify({
        webhook: { url: correctWebhookUrl, enabled: true, events: ['MESSAGES_UPSERT'] }
    })
});
const setData = await setRes.json();
results.webhookUpdate = { status: setRes.status, data: setData };
console.log('\n[2] Actualización Status:', setRes.status);
console.log(JSON.stringify(setData, null, 2));

// 3. Health check al microservicio AWS
try {
    const healthRes = await fetch('http://18.216.112.9:3001/api/admin/health', {
        headers: { Authorization: 'Bearer cholo-token-dev' },
        signal: AbortSignal.timeout(6000)
    });
    const healthData = await healthRes.json();
    results.healthCheck = { status: healthRes.status, data: healthData };
    console.log('\n[3] Health check status:', healthRes.status);
    console.log(JSON.stringify(healthData, null, 2));
} catch (e) {
    results.healthCheck = { error: e.message };
    console.error('\n[3] ERROR accediendo al microservicio AWS:', e.message);
}

writeFileSync('diag-output.json', JSON.stringify(results, null, 2));
console.log('\nResultados guardados en diag-output.json');
