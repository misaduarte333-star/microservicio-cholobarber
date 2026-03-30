import { ChatOpenAI } from '@langchain/openai'
import dotenv from 'dotenv'
dotenv.config()

async function test() {
    const llm = new ChatOpenAI({
        openAIApiKey: process.env.OPENAI_API_KEY,
        modelName: 'gpt-4o-mini'
    })
    try {
        const res = await llm.invoke('Hola')
        console.log('✅ OpenAI Response:', res.content)
    } catch (e: any) {
        console.error('❌ OpenAI Error:', e.message)
    }
}
test()
