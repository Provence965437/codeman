export async function importPptx(file) {
  const form = new FormData();
  form.append('ppt_file', file);

  const response = await fetch('/api/presentation/parse-pptx', {
    method: 'POST',
    body: form,
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error('PPTX 解析服务未就绪，请运行 npm run dev');
  }

  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'PPTX 解析失败');
  }

  return result.data;
}
