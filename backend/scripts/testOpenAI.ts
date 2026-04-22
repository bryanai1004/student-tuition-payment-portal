import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { CHAT_MODEL, client } from '../src/config/openai.js';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
});

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

try {
  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: 'user', content: 'Reply with: ok' }],
    max_tokens: 8,
    temperature: 0,
  });
  const output = res.choices[0]?.message?.content?.trim();
  if (!output) {
    console.error('No response text returned');
    process.exit(1);
  }
  console.log(`[openai] model: ${CHAT_MODEL}`);
  console.log(`Response: ${output}`);
  console.log('OpenAI request succeeded.');
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
