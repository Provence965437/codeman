/** 从 SDK subtitle_on 事件 payload 提取字幕文本 */
export function extractSubtitleText(data) {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  return data.text ?? data.content ?? data.subtitle ?? data.msg ?? '';
}
