async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      throw new Error('API 服务未就绪。请重启开发服务：npm run dev（需同时启动前端和 API）');
    }
    throw new Error(`服务器返回异常：${text.slice(0, 120)}`);
  }
}

export async function askDeepSeek({ apiKey, question, slides, currentIndex, history, model }) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DeepSeek-Key': apiKey,
    },
    body: JSON.stringify({
      question,
      slides,
      currentIndex,
      history,
      model,
    }),
  });

  const result = await parseJsonResponse(response);
  if (!response.ok || !result.ok) {
    throw new Error(result.error || '问答请求失败');
  }

  return result.answer;
}

export function sanitizeForSpeech(text) {
  return text
    .replace(/[*#`_~\[\]()]/g, '')
    .replace(/\n+/g, '，')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
