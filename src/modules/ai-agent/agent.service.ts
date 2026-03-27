import { ChatOpenAI } from '@langchain/openai';
// @ts-ignore
import { createToolCallingAgent, AgentExecutor } from '@langchain/classic/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DateTime } from 'luxon';
import { envConfig } from '../../config/env.config';
import { SYSTEM_PROMPT } from './prompts/system.prompt';
import { MemoryService } from '../database/memory.service';
import { ProviderService } from '../config/provider.service';

// Tools
import {
  consultarServiciosTool,
  consultarBarberosTool,
  consultarSucursalTool,
  consultarBloqueosTool,
  consultarTendenciasTool,
  enviarFotosCortesTool,
} from './tools/business.tools';
import { disponibilidadHoyTool, disponibilidadOtroDiaTool } from './tools/availability.tools';
import {
  agendarCitaTool,
  cancelarCitaTool,
  moverCitaTool,
  misCitasTool,
} from './tools/appointment.tools';
import { validarHoraTool } from './tools/time-validator.langchain';

async function buildLLM(): Promise<BaseChatModel> {
  const { active, models } = await ProviderService.getConfig();
  const model = models[active];
  const apiKey = await ProviderService.getApiKey(active);

  if (active === 'anthropic') {
    const { ChatAnthropic } = await import('@langchain/anthropic');
    const llm = new ChatAnthropic({ anthropicApiKey: apiKey, model, temperature: 0 });
    (llm as any).topP = undefined;
    return llm as unknown as BaseChatModel;
  }
  if (active === 'google') {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
    return new ChatGoogleGenerativeAI({ apiKey, model, temperature: 0 }) as unknown as BaseChatModel;
  }
  return new ChatOpenAI({ openAIApiKey: apiKey, modelName: model, temperature: 0 });
}

export class AgentService {
  private async getAgentExecutor() {
    const tools = [
      consultarServiciosTool,
      consultarBarberosTool,
      consultarSucursalTool,
      consultarBloqueosTool,
      consultarTendenciasTool,
      enviarFotosCortesTool,
      disponibilidadHoyTool,
      disponibilidadOtroDiaTool,
      agendarCitaTool,
      cancelarCitaTool,
      moverCitaTool,
      misCitasTool,
      validarHoraTool,
    ];

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_PROMPT],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const llm = await buildLLM();
    const agent = createToolCallingAgent({ llm, tools, prompt });

    const executor = new AgentExecutor({ agent, tools, verbose: false, returnIntermediateSteps: true });

    const agentWithChatHistory = new RunnableWithMessageHistory({
      runnable: executor,
      getMessageHistory: MemoryService.getChatHistory,
      inputMessagesKey: 'input',
      historyMessagesKey: 'chat_history',
    });

    return agentWithChatHistory;
  }

  public async run(
    sessionId: string,
    input: string,
    senderPhone?: string,
    source?: string,
  ): Promise<{ output: string; intermediateSteps?: any[] }> {
    const agentWithHistory = await this.getAgentExecutor();
    const now = DateTime.now().setZone('America/Hermosillo');

    const { active } = await ProviderService.getConfig();
    const timeoutMs = envConfig.AGENT_TIMEOUT_MS;
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent timeout after ${timeoutMs}ms`)), timeoutMs)
      );
      const result = await Promise.race([
        agentWithHistory.invoke(
          {
            input,
            current_date: now.toFormat('yyyy-MM-dd'),
            current_time: now.toFormat('HH:mm'),
            sender_phone: senderPhone ?? 'unknown',
          },
          { configurable: { sessionId } },
        ),
        timeoutPromise,
      ]);
      const raw = result.output;
      const output: string = (Array.isArray(raw)
        ? raw.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
        : String(raw)).trim();
      return {
        output,
        intermediateSteps: result.intermediateSteps,
      };
    } catch (e: any) {
      await ProviderService.reportLiveError(active, e.message ?? String(e));
      throw e;
    }
  }
}
