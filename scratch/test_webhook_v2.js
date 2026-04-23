
require('dotenv').config();

const webhookUrl = 'https://cholobot-microservicio.ada8bf.easypanel.host/api/webhook/evolution';
const payload = {
  "event": "messages.upsert",
  "instance": "cholobarber_v2",
  "data": {
    "key": {
      "remoteJid": "5216622782576@s.whatsapp.net",
      "fromMe": false,
      "id": "TEST_MSG_CHOLO_001"
    },
    "pushName": "Test User",
    "message": {
      "conversation": "Qué onda cholo, me puedes agendar un corte a las 5?"
    },
    "messageType": "conversation",
    "source": "ios"
  },
  "destination": "https://cholobot-microservicio.ada8bf.easypanel.host/api/webhook/evolution",
  "date_time": new Date().toISOString(),
  "sender": "5216622782576@s.whatsapp.net",
  "server_url": "localhost",
  "apikey": "46AB8DC1B217-4C73-96DA-78B8B4C2C729"
};

fetch(webhookUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => console.log('Response:', data))
.catch(err => console.error('Error:', err));
