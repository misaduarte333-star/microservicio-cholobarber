
const url = 'https://cholobot-evolution.ada8bf.easypanel.host/instance/create';
const globalKey = '123456.+az1';

fetch(url, {
  method: 'POST',
  headers: {
    'apikey': globalKey,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    instanceName: "barberia",
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    token: "A4DA6104E423-45A2-920A-1413AE0372C2" // Keeping the old token for consistency
  })
})
.then(res => res.json())
.then(data => console.log('Created barberia:', JSON.stringify(data, null, 2)))
.catch(err => console.error('Error creating barberia:', err));
