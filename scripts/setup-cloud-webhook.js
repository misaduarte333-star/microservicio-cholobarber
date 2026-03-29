const API_URL = 'https://evolution-evolution.63xlnm.easypanel.host';
const API_KEY = '123456.+az1';
const INSTANCE = 'barberia';
const WEBHOOK_URL = 'https://unsavage-unimposing-reena.ngrok-free.dev/webhook';

async function setupWebhook() {
  console.log(`Configurando webhook para la instancia ${INSTANCE}...`);
  console.log(`URL de Webhook: ${WEBHOOK_URL}`);

  try {
    const response = await fetch(`${API_URL}/webhook/set/${INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
      },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: WEBHOOK_URL,
          webhookByEvents: false,
          webhookBase64: false,
          events: ['MESSAGES_UPSERT'],
        },
      }),
    });

    const body = await response.text();
    if (response.ok) {
      console.log('✅ Webhook configurado con éxito!');
      console.log('Respuesta:', body);
    } else {
      console.error(`❌ Error al configurar webhook (Status ${response.status}):`);
      console.error(body);
    }
  } catch (error) {
    console.error('❌ Error de red:', error.message);
  }
}

setupWebhook();
