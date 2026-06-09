const STORAGE_KEY = 'xingyun-video-demo-config';

const STATE_LABEL = {
  not_send: '排队中',
  waiting: '处理中',
  processing: '渲染中',
  finished: '已完成',
  error: '失败',
  cancel: '已取消',
};

const els = {
  appId: document.getElementById('appId'),
  appSecret: document.getElementById('appSecret'),
  lookName: document.getElementById('lookName'),
  ttsVcnName: document.getElementById('ttsVcnName'),
  studioName: document.getElementById('studioName'),
  resolution: document.getElementById('resolution'),
  videoName: document.getElementById('videoName'),
  pptFile: document.getElementById('pptFile'),
  fileMeta: document.getElementById('fileMeta'),
  generateBtn: document.getElementById('generateBtn'),
  pollBtn: document.getElementById('pollBtn'),
  taskStatus: document.getElementById('taskStatus'),
  taskMeta: document.getElementById('taskMeta'),
  progressBar: document.getElementById('progressBar'),
  logBox: document.getElementById('logBox'),
  previewEmpty: document.getElementById('previewEmpty'),
  previewVideo: document.getElementById('previewVideo'),
  downloadLink: document.getElementById('downloadLink'),
};

let pollTimer = null;
let currentTaskId = null;

function log(message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  els.logBox.textContent = `[${time}] ${message}\n${els.logBox.textContent}`.trim();
}

function setStatus(text, type = 'default') {
  els.taskStatus.textContent = text;
  els.taskStatus.className = 'status-pill';
  if (type === 'ready') els.taskStatus.classList.add('ready');
  if (type === 'error') els.taskStatus.classList.add('error');
}

function setProgress(value) {
  const percent = Math.max(0, Math.min(100, value));
  els.progressBar.style.width = `${percent}%`;
}

function readConfig() {
  return {
    appId: els.appId.value.trim(),
    appSecret: els.appSecret.value.trim(),
    look_name: els.lookName.value.trim(),
    tts_vcn_name: els.ttsVcnName.value.trim(),
    studio_name: els.studioName.value.trim(),
    output_resolution: els.resolution.value,
    video_name: els.videoName.value.trim() || undefined,
  };
}

function saveConfig() {
  const config = readConfig();
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      appId: config.appId,
      appSecret: config.appSecret,
      look_name: config.look_name,
      tts_vcn_name: config.tts_vcn_name,
      studio_name: config.studio_name,
      output_resolution: config.output_resolution,
    }),
  );
}

function restoreConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.appId) els.appId.value = saved.appId;
    if (saved.appSecret) els.appSecret.value = saved.appSecret;
    if (saved.look_name) els.lookName.value = saved.look_name;
    if (saved.tts_vcn_name) els.ttsVcnName.value = saved.tts_vcn_name;
    if (saved.studio_name) els.studioName.value = saved.studio_name;
    if (saved.output_resolution) els.resolution.value = saved.output_resolution;
  } catch {
    // ignore
  }
}

function authHeaders(config) {
  return {
    'X-APP-ID': config.appId,
    'X-APP-SECRET': config.appSecret,
  };
}

function validateConfig(config) {
  if (!config.appId || !config.appSecret) throw new Error('请填写 App ID 和 App Secret');
  if (!config.look_name || !config.tts_vcn_name || !config.studio_name) {
    throw new Error('请填写形象 ID、音色 ID 和演播室 ID');
  }
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function showPreview(url) {
  els.previewEmpty.classList.add('hidden');
  els.previewVideo.classList.remove('hidden');
  els.downloadLink.classList.remove('hidden');
  els.previewVideo.src = url;
  els.downloadLink.href = url;
}

function resetPreview() {
  els.previewEmpty.classList.remove('hidden');
  els.previewVideo.classList.add('hidden');
  els.downloadLink.classList.add('hidden');
  els.previewVideo.removeAttribute('src');
  els.downloadLink.removeAttribute('href');
}

async function parsePpt(config, file) {
  const form = new FormData();
  form.append('ppt_file', file);

  const response = await fetch('/api/video/parse-ppt', {
    method: 'POST',
    headers: authHeaders(config),
    body: form,
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'PPT 解析失败');
  }
  return result.data;
}

async function createRender(config, parsePptFileName) {
  const response = await fetch('/api/video/render', {
    method: 'POST',
    headers: {
      ...authHeaders(config),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parse_ppt_file_name: parsePptFileName,
      look_name: config.look_name,
      tts_vcn_name: config.tts_vcn_name,
      studio_name: config.studio_name,
      video_name: config.video_name,
      output_resolution: config.output_resolution,
      sub_title: 'on',
      if_aigc_mark: true,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || '创建渲染任务失败');
  }
  return result.data;
}

async function fetchTask(config, taskId) {
  const response = await fetch(`/api/video/task/${taskId}`, {
    headers: authHeaders(config),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.error || '查询任务失败');
  }
  return result.data;
}

function progressByState(state) {
  switch (state) {
    case 'not_send':
      return 15;
    case 'waiting':
      return 35;
    case 'processing':
      return 70;
    case 'finished':
      return 100;
    default:
      return 5;
  }
}

async function pollTask(config, taskId) {
  const data = await fetchTask(config, taskId);
  const state = data.synth_state;
  const label = STATE_LABEL[state] || state;

  setStatus(`${label}`, state === 'finished' ? 'ready' : state === 'error' ? 'error' : 'default');
  setProgress(progressByState(state));
  els.taskMeta.textContent = `任务 ID：${taskId}${data.amount ? ` · 消耗积分：${data.amount}` : ''}`;
  log(`任务状态：${label}${data.error_reason ? `（${data.error_reason}）` : ''}`);

  if (state === 'finished') {
    stopPolling();
    els.generateBtn.disabled = false;
    els.pollBtn.disabled = true;
    if (data.render_video_oss) {
      showPreview(data.render_video_oss);
      log(`视频生成成功：${data.render_video_oss}`);
    } else {
      log('任务已完成，但未返回视频地址');
    }
    return;
  }

  if (state === 'error' || state === 'cancel') {
    stopPolling();
    els.generateBtn.disabled = false;
    els.pollBtn.disabled = true;
    setStatus(label, 'error');
  }
}

function startPolling(config, taskId) {
  stopPolling();
  currentTaskId = taskId;
  els.pollBtn.disabled = false;
  pollTask(config, taskId);
  pollTimer = setInterval(() => {
    pollTask(config, taskId).catch((error) => {
      log(`轮询失败：${error.message}`);
    });
  }, 4000);
}

async function generateVideo() {
  const config = readConfig();
  const file = els.pptFile.files?.[0];

  try {
    validateConfig(config);
    if (!file) throw new Error('请选择 .pptx 文件');
  } catch (error) {
    alert(error.message);
    return;
  }

  saveConfig();
  resetPreview();
  stopPolling();
  els.generateBtn.disabled = true;
  setStatus('上传解析中...', 'default');
  setProgress(8);
  log(`开始上传 PPT：${file.name}`);

  try {
    const parseResult = await parsePpt(config, file);
    const parseName = parseResult.parse_ppt_file_name;
    log(`PPT 解析成功：${parseName}`);

    setStatus('创建渲染任务...', 'default');
    setProgress(20);
    const renderResult = await createRender(config, parseName);
    const taskId = renderResult.task_id;
    log(`渲染任务已创建，task_id = ${taskId}`);

    setStatus('排队渲染中...', 'default');
    startPolling(config, taskId);
  } catch (error) {
    log(`失败：${error.message}`);
    setStatus('失败', 'error');
    els.generateBtn.disabled = false;
    alert(error.message);
  }
}

els.pptFile.addEventListener('change', () => {
  const file = els.pptFile.files?.[0];
  els.fileMeta.textContent = file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : '未选择文件';
});

els.generateBtn.addEventListener('click', generateVideo);
els.pollBtn.addEventListener('click', async () => {
  if (!currentTaskId) return;
  try {
    await pollTask(readConfig(), currentTaskId);
  } catch (error) {
    alert(error.message);
  }
});

restoreConfig();
log('PPT 视频生成 Demo 已就绪。请先启动 API 服务：npm run dev');
