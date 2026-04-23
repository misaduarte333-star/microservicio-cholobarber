
const url = 'https://cholobot-evolution.ada8bf.easypanel.host/webhook/set/cholobarber_v2';
const globalKey = '123456.+az1';

fetch(url, {
  method: 'POST',
  headers: {
    'apikey': globalKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    webhook: {
      url: 'https://cholobot-microservicio.ada8bf.easypanel.host/api/webhook/evolution',
      enabled: true,
      webhookByEvents: false,
      webhookBase64: false,
      events: ["MESSAGES_UPSERT"]
    }
  })
})
.then(res => res.json())
.then(data => console.log('Webhook set:', JSON.stringify(data, null, 2)))
.catch(err => console.error('Error setting webhook:', err));
