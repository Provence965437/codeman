const DEEPSEEK_BASE = 'https://api.deepseek.com';

export async function chatCompletion({ apiKey, messages, model = 'deepseek-v4-flash' }) {
  const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      max_tokens: 512,
      temperature: 0.7,
      thinking: { type: 'disabled' },
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    const message = result?.error?.message || `DeepSeek 请求失败 (${response.status})`;
    throw new Error(message);
  }

  const content = result?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('DeepSeek 未返回有效内容');
  }

  return content;
}
