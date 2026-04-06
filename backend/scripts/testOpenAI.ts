import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
});

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

try {
  const res = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: 'Hello AMU',
  });
  const vec = res.data[0]?.embedding;
  if (!vec) {
    console.error('No embedding in response');
    process.exit(1);
  }
  console.log(`Embedding length: ${vec.length}`);
  console.log('OpenAI key works.');
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
