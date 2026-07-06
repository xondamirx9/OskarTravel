// Генерация текстов через Claude API. Без ANTHROPIC_API_KEY модуль честно
// сообщает об этом вызывающему коду — writer.js использует шаблонный fallback.
const { logger } = require('./logger');

const log = logger('llm');
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

function hasLLM() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client = null;
function getClient() {
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ maxRetries: 3 });
  }
  return client;
}

// Свободный текст
async function complete(system, userPrompt, maxTokens = 4000) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Модель отклонила запрос (refusal)');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  log.info(`Сгенерировано ${text.length} символов, модель ${MODEL}`);
  return text;
}

// Строгий JSON по схеме (structured outputs)
async function completeJSON(system, userPrompt, schema, maxTokens = 4000) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: userPrompt }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Модель отклонила запрос (refusal)');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

module.exports = { hasLLM, complete, completeJSON, MODEL };
