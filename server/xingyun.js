import crypto from 'crypto';

const HOST = 'https://nebula-agent.xingyun3d.com';

const ERROR_HINTS = {
  20001:
    '应用不存在或无法使用。请确认：1) 使用的是「视频生成应用」的密钥（不是「具身驱动应用」）；2) App ID / Secret 从控制台「应用管理 → 数字人视频生成 → 查看密钥」复制；3) 无多余空格。',
  30002: 'PPT 文件不存在，请重新上传。',
  30003: 'PPT 文件解析错误，请检查文件是否为有效 .pptx。',
};

function formatApiError(result, fallback) {
  const code = result?.error_code;
  const reason = result?.error_reason || fallback;
  const hint = ERROR_HINTS[code];
  if (hint) return `[${code}] ${reason}。${hint}`;
  if (code) return `[${code}] ${reason}`;
  return reason || fallback;
}

function sortKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  return Object.keys(obj)
    .sort()
    .reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {});
}

export function generateXToken(data, secret, apiPath, method, timestamp) {
  const lowerApiPath = apiPath.toLowerCase();
  const lowerMethod = method.toLowerCase();
  const sortJsonStr = JSON.stringify(sortKeys(data ?? {})).replace(/ /g, '');
  const xTimestamp = String(timestamp ?? Math.floor(Date.now() / 1000));
  const signStr = `${lowerApiPath}${lowerMethod}${sortJsonStr}${secret}${xTimestamp}`;
  return crypto.createHash('md5').update(signStr, 'utf8').digest('hex');
}

export function buildHeaders(appId, secret, apiPath, method, data = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    'X-APP-ID': appId,
    'X-TIMESTAMP': String(timestamp),
    'X-TOKEN': generateXToken(data, secret, apiPath, method, timestamp),
  };
}

export async function parsePptFile(appId, secret, fileBuffer, filename) {
  const apiPath = '/user/v1/video_synthesis_task/parse_ppt_file';
  const method = 'POST';
  const data = {};
  const headers = buildHeaders(appId, secret, apiPath, method, data);

  const form = new FormData();
  form.append(
    'ppt_file',
    new Blob([fileBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }),
    filename,
  );

  const response = await fetch(`${HOST}${apiPath}`, {
    method,
    headers,
    body: form,
  });

  const result = await response.json();
  if (!response.ok || result.error_code !== 0) {
    const error = new Error(formatApiError(result, 'PPT 解析失败'));
    error.code = result.error_code;
    throw error;
  }
  return result.data;
}

export async function createRenderTask(appId, secret, payload) {
  const apiPath = '/user/v1/video_synthesis_task/create_render_task';
  const method = 'POST';
  const headers = {
    ...buildHeaders(appId, secret, apiPath, method, payload),
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${HOST}${apiPath}`, {
    method,
    headers,
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok || result.error_code !== 0) {
    const error = new Error(formatApiError(result, '创建渲染任务失败'));
    error.code = result.error_code;
    throw error;
  }
  return result.data;
}

export async function getRenderTask(appId, secret, taskId) {
  const apiPath = `/user/v1/video_synthesis_task/get_render_task?task_id=${taskId}`;
  const method = 'GET';
  const headers = buildHeaders(appId, secret, apiPath, method, {});

  const response = await fetch(`${HOST}${apiPath}`, { method, headers });
  const result = await response.json();
  if (!response.ok || result.error_code !== 0) {
    throw new Error(result.error_reason || `查询任务失败 (${result.error_code})`);
  }
  return result.data;
}
