
fetch('https://cholobot-microservicio.ada8bf.easypanel.host/api/webhook/evolution', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    "event": "messages.upsert",
    "instance": "cholobarber",
    "data": {
      "messages": [
        {
          "key": {
            "remoteJid": "5211234567890@s.whatsapp.net",
            "fromMe": false
          },
          "message": {
            "conversation": "Hola, prueba manual!"
          },
          "pushName": "Test User"
        }
      ]
    }
  })
})
.then(res => res.text())
.then(text => console.log('Response:', text))
.catch(err => console.error('Error:', err));
