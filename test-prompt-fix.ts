import { buildSystemPrompt } from './src/lib/ai/prompts';

const mockContext = {
    nombre: 'Cholo Barber',
    agentName: 'CholoBot',
    personality: 'Cholo',
    timezone: 'America/Hermosillo',
    sucursal: {
        nombre: 'Cholo Barber',
        direccion: 'Calle Falsa 123',
        telefono_whatsapp: '1234567890',
        horario_apertura: {
            lunes: { cierre: '21:00', apertura: '08:00' },
            domingo: { cierre: '18:00', apertura: '08:00' }
        }
    },
    barberos: [],
    servicios: []
};

const prompt = buildSystemPrompt(mockContext as any);
console.log(prompt);
