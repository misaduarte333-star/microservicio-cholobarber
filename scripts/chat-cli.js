const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const API_URL = 'http://localhost:3000/chat';
const sessionId = 'cli-test-' + Math.random().toString(36).substring(7);

console.log('--- 🛡️ CholoBot Local Chat CLI ---');
console.log('Escribe "salir" para terminar.\n');

async function askQuestion() {
  rl.question('👤 Tú: ', async (message) => {
    if (message.toLowerCase() === 'salir') {
      rl.close();
      return;
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionId })
      });

      const data = await response.json();
      
      if (data.error) {
        console.log('❌ Error:', data.error);
      } else {
        console.log('🤖 Bot:', data.response);
      }
    } catch (error) {
      console.error('❌ Error de conexión:', error.message);
    }

    console.log('');
    askQuestion();
  });
}

askQuestion();
