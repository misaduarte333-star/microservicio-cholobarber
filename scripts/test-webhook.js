const testPayload = {
  data: {
    key: {
      remoteJid: "5215555555555@s.whatsapp.net",
      id: "TEST_SESSION_123"
    },
    messageType: "conversation",
    pushName: "Test User",
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: {
      conversation: "Cuales son sus horarios?"
    }
  }
};

fetch('http://localhost:3001/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(testPayload)
})
.then(res => res.text())
.then(data => console.log("Respuesta del servidor HTTP:", data))
.catch(err => console.error("Error conectando:", err));
