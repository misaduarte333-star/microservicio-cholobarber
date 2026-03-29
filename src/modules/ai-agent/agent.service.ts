import { ChatOpenAI } from '@langchain/openai';
// @ts-ignore
import { createToolCallingAgent, AgentExecutor } from '@langchain/classic/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DateTime } from 'luxon';
import { envConfig } from '../../config/env.config';
import { buildSystemPrompt } from './prompts/system.prompt';
import { MemoryService } from '../database/memory.service';
import { ProviderService } from '../config/provider.service';
import { BusinessContext } from '../businesses/business-context.interface';
import { makeAllTools } from './tools';

async function buildLLM(llmConfig: BusinessContext['llm']): Promise<BaseChatModel> {
  const provider = llmConfig.provider;
  // Tenant's own API key takes priority; fall back to global ProviderService key
  const apiKey = llmConfig.apiKey ?? (await ProviderService.getApiKey(provider));
  const { models } = await ProviderService.getConfig();
  const model = llmConfig.model ?? models[provider];

  if (provider === 'anthropic') {
    const { ChatAnthropic } = await import('@langchain/anthropic');
    const llm = new ChatAnthropic({ anthropicApiKey: apiKey, model, temperature: 0 });
    (llm as any).topP = undefined;
    return llm as unknown as BaseChatModel;
  }
  if (provider === 'google') {
    const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
    return new ChatGoogleGenerativeAI({ apiKey, model, temperature: 0 }) as unknown as BaseChatModel;
  }
  return new ChatOpenAI({ openAIApiKey: apiKey, modelName: model, temperature: 0 });
}

export class AgentService {
  public async run(
    sessionId: string,
    input: string,
    senderPhone: string,
    ctx: BusinessContext,
  ): Promise<{ output: string; intermediateSteps?: any[] }> {

    const tools = makeAllTools(ctx.sucursalId, ctx.evolution, ctx.timezone);

    const systemPromptStr = buildSystemPrompt(ctx);

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPromptStr],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const llm = await buildLLM(ctx.llm);
    const agent = createToolCallingAgent({ llm, tools, prompt });
    const executor = new AgentExecutor({ agent, tools, verbose: false, returnIntermediateSteps: true });

    const agentWithHistory = new RunnableWithMessageHistory({
      runnable: executor,
      getMessageHistory: MemoryService.getChatHistory,
      inputMessagesKey: 'input',
      historyMessagesKey: 'chat_history',
    });

    const now = DateTime.now().setZone(ctx.timezone);
    const timeoutMs = envConfig.AGENT_TIMEOUT_MS;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent timeout after ${timeoutMs}ms`)), timeoutMs),
      );

      const result = await Promise.race([
        agentWithHistory.invoke(
          {
            input,
            current_date: now.toFormat('yyyy-MM-dd'),
            current_time: now.toFormat('HH:mm'),
            sender_phone: senderPhone,
          },
          { configurable: { sessionId } },
        ),
        timeoutPromise,
      ]);

      const raw = result.output;
      const output: string = (Array.isArray(raw)
        ? raw.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
        : String(raw)).trim();

      return { output, intermediateSteps: result.intermediateSteps };
    } catch (e: any) {
      await ProviderService.reportLiveError(ctx.llm.provider, e.message ?? String(e));
      throw e;
    }
  }
}
