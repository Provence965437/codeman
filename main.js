import { createPresentationController } from './presentation.js';
import { askDeepSeek, sanitizeForSpeech } from './chat.js';
import { importPptx } from './import-pptx.js';
import { initArchitectureModal } from './architecture-modal.js';
import { extractSubtitleText } from './subtitle.js';

const STORAGE_KEY = 'xingyun-avatar-demo-config';
const CHAT_STORAGE_KEY = 'xingyun-chat-demo-config';

const MODE_LABEL = {
  idle: '待机',
  presenting: '讲解中',
  paused: '已暂停',
  qa: '问答中',
};

const els = {
  appId: document.getElementById('appId'),
  appSecret: document.getElementById('appSecret'),
  connectBtn: document.getElementById('connectBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  progressBar: document.getElementById('progressBar'),
  progressText: document.getElementById('progressText'),
  statusText: document.getElementById('statusText'),
  textInput: document.getElementById('textInput'),
  speakBtn: document.getElementById('speakBtn'),
  interruptBtn: document.getElementById('interruptBtn'),
  subtitleBar: document.getElementById('subtitleBar'),
  subtitleText: document.getElementById('subtitleText'),
  logBox: document.getElementById('logBox'),
  placeholder: document.getElementById('placeholder'),
  slideContent: document.getElementById('slideContent'),
  slideTitle: document.getElementById('slideTitle'),
  pageIndicator: document.getElementById('pageIndicator'),
  pptModeBadge: document.getElementById('pptModeBadge'),
  pptProgressFill: document.getElementById('pptProgressFill'),
  pptPageStrip: document.getElementById('pptPageStrip'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  resumeBtn: document.getElementById('resumeBtn'),
  stopBtn: document.getElementById('stopBtn'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  deepseekKey: document.getElementById('deepseekKey'),
  deepseekModel: document.getElementById('deepseekModel'),
  questionInput: document.getElementById('questionInput'),
  questionCompose: document.getElementById('questionCompose'),
  askToggleBtn: document.getElementById('askToggleBtn'),
  sendQuestionBtn: document.getElementById('sendQuestionBtn'),
  questionCancelBtn: document.getElementById('questionCancelBtn'),
  answerPreview: document.getElementById('answerPreview'),
  pptImportFile: document.getElementById('pptImportFile'),
  pptImportBtn: document.getElementById('pptImportBtn'),
  pptImportMeta: document.getElementById('pptImportMeta'),
  orbitBackCards: [...document.querySelectorAll('[data-orbit-back-card]')],
  orbitFrontCards: [...document.querySelectorAll('[data-orbit-front-card]')],
};

let sdk = null;
let isReady = false;
let isConnecting = false;
let isAsking = false;
let isImporting = false;
let isQuestionPanelOpen = false;
let chatHistory = [];
let audioUnlockState = {
  attempted: false,
  unlocked: false,
  context: null,
};

function initAvatarOrbit() {
  const backCards = els.orbitBackCards;
  const frontCards = els.orbitFrontCards;
  const stage = document.querySelector('.slide-stage-sdk');
  const placeholder = els.placeholder;

  if (
    !backCards.length ||
    backCards.length !== frontCards.length ||
    !stage ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  let frameId = 0;

  function getOrbitMetrics(stageRect) {
    if (placeholder && placeholder.offsetWidth > 0 && placeholder.offsetHeight > 0) {
      const rect = placeholder.getBoundingClientRect();
      return {
        x: rect.left - stageRect.left + rect.width / 2,
        y: rect.top - stageRect.top + rect.height / 2 - 6,
        radiusX: rect.width * 0.86,
        radiusY: rect.height * 0.14,
      };
    }

    return {
      x: stageRect.width * 0.8,
      y: stageRect.height * 0.56,
      radiusX: Math.min(stageRect.width * 0.22, 190),
      radiusY: Math.min(stageRect.height * 0.09, 56),
    };
  }

  function render(now) {
    const stageRect = stage.getBoundingClientRect();
    const { x: anchorX, y: anchorY, radiusX, radiusY } = getOrbitMetrics(stageRect);
    const time = now * 0.00042;

    backCards.forEach((backCard, index) => {
      const frontCard = frontCards[index];
      const angle = time + (index / backCards.length) * Math.PI * 2;
      const depth = (Math.sin(angle) + 1) / 2;
      const x = Math.cos(angle) * radiusX;
      const y = Math.sin(angle) * radiusY;
      const scale = 0.72 + depth * 0.34;
      const opacity = 0.16 + depth * 0.84;
      const rotate = (x / radiusX) * 10;
      const blur = (1 - depth) * 1.8;
      const transform =
        `translate3d(${anchorX + x}px, ${anchorY + y}px, 0) translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`;
      const filter = `blur(${blur.toFixed(2)}px) saturate(${(0.78 + depth * 0.4).toFixed(2)})`;
      const isFront = depth >= 0.5;

      backCard.style.transform = transform;
      backCard.style.filter = filter;
      backCard.style.zIndex = `${10 + Math.round(depth * 10)}`;
      backCard.style.opacity = isFront ? '0' : opacity.toFixed(3);
      backCard.style.visibility = isFront ? 'hidden' : 'visible';

      frontCard.style.transform = transform;
      frontCard.style.filter = filter;
      frontCard.style.zIndex = `${20 + Math.round(depth * 10)}`;
      frontCard.style.opacity = isFront ? opacity.toFixed(3) : '0';
      frontCard.style.visibility = isFront ? 'visible' : 'hidden';
    });

    frameId = window.requestAnimationFrame(render);
  }

  frameId = window.requestAnimationFrame(render);
  window.addEventListener('beforeunload', () => window.cancelAnimationFrame(frameId), { once: true });
}

async function unlockAudio() {
  if (audioUnlockState.unlocked) {
    return true;
  }

  audioUnlockState.attempted = true;

  try {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor) {
      if (!audioUnlockState.context) {
        audioUnlockState.context = new AudioContextCtor();
      }

      if (audioUnlockState.context.state === 'suspended') {
        await audioUnlockState.context.resume();
      }

      const oscillator = audioUnlockState.context.createOscillator();
      const gain = audioUnlockState.context.createGain();
      gain.gain.value = 0.0001;
      oscillator.connect(gain);
      gain.connect(audioUnlockState.context.destination);
      oscillator.start();
      oscillator.stop(audioUnlockState.context.currentTime + 0.02);
    }

    const audio = new Audio(
      'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAFAAAGhgD///////////////////////////////////////////////8AAAA8TEFNRTMuMTAwAc0AAAAAAAAAABQgJAUHQQAB9AAABox2vGMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    );
    audio.muted = true;
    audio.playsInline = true;

    try {
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // ignore; some browsers still unlock via AudioContext only
    }

    audioUnlockState.unlocked = true;
    log('移动端音频已解锁');
    return true;
  } catch (error) {
    log(`音频解锁失败：${error.message || error}`);
    return false;
  }
}

function attachAudioUnlockListeners() {
  const triggerUnlock = () => {
    unlockAudio();
  };

  ['touchstart', 'pointerdown', 'click'].forEach((eventName) => {
    window.addEventListener(eventName, triggerUnlock, { passive: true, once: true });
  });
}

function log(message) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  els.logBox.textContent = `[${time}] ${message}\n${els.logBox.textContent}`.trim();
}

function setStatus(text, type = 'default') {
  els.statusText.textContent = text;
  els.statusText.className = 'status-pill';
  if (type === 'ready') els.statusText.classList.add('ready');
  if (type === 'error') els.statusText.classList.add('error');
}

function setProgress(progress) {
  const value = Math.max(0, Math.min(100, Number(progress) || 0));
  els.progressBar.style.width = `${value}%`;
  els.progressText.textContent = value > 0 ? `资源加载进度：${value}%` : '等待连接';
}

function updatePageStrip(currentIndex, total) {
  if (!els.pptPageStrip) return;

  if (els.pptPageStrip.childElementCount !== total) {
    els.pptPageStrip.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
      const seg = document.createElement('span');
      seg.className = 'ppt-page-seg';
      seg.title = `第 ${i + 1} 页`;
      els.pptPageStrip.appendChild(seg);
    }
  }

  [...els.pptPageStrip.children].forEach((seg, index) => {
    seg.classList.toggle('is-active', index === currentIndex);
    seg.classList.toggle('is-done', index < currentIndex);
  });
}

function updatePresentationControls(mode, currentIndex, total) {
  const connected = Boolean(sdk) && isReady;
  const pageNum = total > 0 ? currentIndex + 1 : 0;

  if (els.pageIndicator) {
    els.pageIndicator.textContent = `第 ${pageNum} / ${total} 页`;
  }

  if (els.pptModeBadge) {
    els.pptModeBadge.textContent = MODE_LABEL[mode] || mode;
    els.pptModeBadge.className = `ppt-mode-badge mode-${mode}`;
  }

  if (els.pptProgressFill && total > 0) {
    els.pptProgressFill.style.width = `${(pageNum / total) * 100}%`;
  }

  updatePageStrip(currentIndex, total);

  els.startBtn.disabled = !connected || mode === 'presenting' || isAsking || isImporting;
  els.pauseBtn.disabled = !connected || mode !== 'presenting' || isAsking || isImporting;
  els.resumeBtn.disabled = !connected || mode !== 'paused' || isAsking || isImporting;
  els.stopBtn.disabled = !connected || mode === 'idle' || isAsking || isImporting;
  els.prevBtn.disabled = !connected || currentIndex <= 0 || isAsking || isImporting;
  els.nextBtn.disabled = !connected || currentIndex >= total - 1 || isAsking || isImporting;
  els.interruptBtn.disabled = !connected || isAsking || isImporting;
  els.askToggleBtn.disabled = !connected || isAsking || isImporting;
  if (els.sendQuestionBtn) {
    els.sendQuestionBtn.disabled =
      !connected || isAsking || isImporting || !isQuestionPanelOpen;
  }
}

function openQuestionPanel() {
  if (!sdk || !isReady || isAsking || isImporting) return;

  isQuestionPanelOpen = true;
  els.questionCompose?.classList.remove('is-hidden');
  els.askToggleBtn?.classList.add('is-active');
  els.questionInput.disabled = false;
  els.sendQuestionBtn.disabled = false;
  els.questionInput.focus();
}

function closeQuestionPanel({ clearInput = false } = {}) {
  isQuestionPanelOpen = false;
  els.questionCompose?.classList.add('is-hidden');
  els.askToggleBtn?.classList.remove('is-active');
  els.questionInput.disabled = !isReady || isAsking;
  els.sendQuestionBtn.disabled = true;
  if (clearInput) {
    els.questionInput.value = '';
    els.answerPreview.textContent = '';
  }
}

function setControls({ connected = false, ready = false } = {}) {
  els.connectBtn.disabled = connected || isConnecting;
  els.disconnectBtn.disabled = !connected && !isConnecting;
  els.textInput.disabled = !ready;
  els.speakBtn.disabled = !ready;
  if (!ready || isAsking) {
    els.questionInput.disabled = true;
  } else if (isQuestionPanelOpen) {
    els.questionInput.disabled = false;
  } else {
    els.questionInput.disabled = true;
  }
  els.appId.disabled = connected || isConnecting;
  els.appSecret.disabled = connected || isConnecting;

  const { mode, currentIndex, total } = presentation.getState();
  updatePresentationControls(mode, currentIndex, total);
}

function setSubtitle(text) {
  const value = String(text ?? '').trim();
  els.subtitleText.textContent = value;
  els.subtitleBar.classList.toggle('is-hidden', !value);
}

/** SDK 事件：{ type, text?, url?, page? }；配置了 onWidgetEvent 时会拦截 proxyWidget，故只走 proxyWidget */
function handleSdkWidgetEvent(data) {
  if (!data?.type) return;

  switch (data.type) {
    case 'subtitle_on': {
      const text = extractSubtitleText(data);
      if (text) {
        setSubtitle(text);
      } else {
        log(`subtitle_on 已触发但 text 为空：${JSON.stringify(data)}`);
      }
      break;
    }
    case 'subtitle_off':
      setSubtitle('');
      break;
    case 'widget_slideshow':
      if (data.url) {
        els.slideContent.innerHTML = `<img class="slide-image" src="${data.url}" alt="PPT 第 ${data.page} 页" />`;
        log(`Widget 切页：第 ${data.page} 页`);
      }
      break;
    default:
      break;
  }
}

const presentation = createPresentationController({
  sdkRef: () => sdk,
  isReadyRef: () => isReady,
  log,
  onSlideChange(html, slide) {
    els.slideContent.innerHTML = html;
    els.slideTitle.textContent = slide.title;
  },
  onStateChange({ mode, currentIndex, total }) {
    updatePresentationControls(mode, currentIndex, total);
  },
  onSubtitleChange(text) {
    setSubtitle(text);
  },
});

function restoreConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.appId) els.appId.value = saved.appId;
    if (saved.appSecret) els.appSecret.value = saved.appSecret;
  } catch {
    // ignore invalid local storage
  }

  try {
    const chatSaved = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '{}');
    if (chatSaved.deepseekKey) els.deepseekKey.value = chatSaved.deepseekKey;
    if (chatSaved.deepseekModel) els.deepseekModel.value = chatSaved.deepseekModel;
  } catch {
    // ignore invalid local storage
  }
}

function saveConfig() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      appId: els.appId.value.trim(),
      appSecret: els.appSecret.value.trim(),
    }),
  );
}

function saveChatConfig() {
  localStorage.setItem(
    CHAT_STORAGE_KEY,
    JSON.stringify({
      deepseekKey: els.deepseekKey.value.trim(),
      deepseekModel: els.deepseekModel.value.trim() || 'deepseek-v4-flash',
    }),
  );
}

function destroySdk() {
  presentation.stop();
  presentation.reset();
  chatHistory = [];
  closeQuestionPanel({ clearInput: true });
  els.answerPreview.textContent = '';

  if (!sdk) {
    setControls({ connected: false, ready: false });
    return;
  }

  try {
    sdk.destroy();
    log('已断开数字人连接');
  } catch (error) {
    log(`销毁实例失败：${error.message}`);
  }

  sdk = null;
  isReady = false;
  els.placeholder.classList.remove('hidden');
  setProgress(0);
  setStatus('已断开', 'default');
  setControls({ connected: false, ready: false });
}

function applySdkTransparentLayer() {
  const container = document.getElementById('sdk');
  if (!container) return;

  container.querySelectorAll('canvas').forEach((canvas) => {
    canvas.style.background = 'transparent';
  });
}

async function connectAvatar() {
  const appId = els.appId.value.trim();
  const appSecret = els.appSecret.value.trim();

  if (!appId || !appSecret) {
    alert('请先填写 App ID 和 App Secret');
    return;
  }

  if (typeof XmovAvatar === 'undefined') {
    alert('SDK 脚本加载失败，请检查网络后刷新页面');
    return;
  }

  if (isConnecting) return;

  destroySdk();
  saveConfig();
  await unlockAudio();

  isConnecting = true;
  setControls({ connected: true, ready: false });
  setStatus('正在连接...', 'default');
  log('开始创建 SDK 实例');

  try {
    sdk = new XmovAvatar({
      containerId: '#sdk',
      appId,
      appSecret,
      gatewayServer: 'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session',
      hardwareAcceleration: 'prefer-hardware',
      enableLogger: false,
      onMessage(message) {
        log(`SDK 消息 [${message.code}] ${message.message}`);
        if (message.code >= 10001 && message.code <= 10005) {
          setStatus('连接异常', 'error');
        }
      },
      onStateChange(state) {
        log(`数字人状态：${state}`);
      },
      onStatusChange(status) {
        log(`SDK 状态码：${status}`);
      },
      onVoiceStateChange(status) {
        log(`语音状态：${status}`);
        presentation.handleVoiceState(status);
      },
      proxyWidget: {
        subtitle_on(data) {
          handleSdkWidgetEvent(data);
        },
        subtitle_off(data) {
          handleSdkWidgetEvent(data);
        },
        widget_slideshow(data) {
          handleSdkWidgetEvent(data);
        },
      },
    });

    await sdk.init({
      onDownloadProgress(progress) {
        setProgress(progress);
        if (progress === 100) {
          log('资源加载完成');
        }
      },
    });

    applySdkTransparentLayer();
    // SDK 可能异步插入 canvas，延迟再刷一次样式
    setTimeout(applySdkTransparentLayer, 500);
    setTimeout(applySdkTransparentLayer, 2000);

    isReady = true;
    els.placeholder.classList.add('hidden');
    setStatus('已连接，可以开始讲解', 'ready');
    log('数字人初始化成功（透明背景叠加 PPT）');
    setControls({ connected: true, ready: true });
  } catch (error) {
    log(`连接失败：${error.message || error}`);
    setStatus('连接失败', 'error');
    if (sdk) {
      try {
        sdk.destroy();
      } catch {
        // ignore destroy errors
      }
    }
    sdk = null;
    isReady = false;
    els.placeholder.classList.remove('hidden');
    setControls({ connected: false, ready: false });
  } finally {
    isConnecting = false;
    setControls({ connected: Boolean(sdk), ready: isReady });
  }
}

function speakWithSdk(text) {
  return new Promise((resolve, reject) => {
    try {
      sdk.interactiveidle();
      setTimeout(() => {
        try {
          presentation.speakExternal(text);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 400);
    } catch (error) {
      reject(error);
    }
  });
}

async function submitQuestion() {
  if (!sdk || !isReady) {
    alert('请先连接数字人');
    return;
  }

  const question = els.questionInput.value.trim();
  if (!question) {
    alert('请输入问题');
    els.questionInput.focus();
    return;
  }

  const deepseekKey = els.deepseekKey.value.trim();
  if (!deepseekKey) {
    alert('请填写 DeepSeek API Key');
    els.deepseekKey.focus();
    return;
  }

  saveChatConfig();
  await unlockAudio();
  presentation.interruptForQuestion();

  isAsking = true;
  setControls({ connected: true, ready: true });
  els.sendQuestionBtn.textContent = '发送中...';
  els.sendQuestionBtn.disabled = true;
  els.answerPreview.textContent = '正在向 DeepSeek 请求回答...';
  log(`用户提问：${question}`);

  try {
    sdk.listen?.();
  } catch {
    // ignore if listen unavailable
  }

  try {
    sdk.think?.();
  } catch {
    // ignore if think unavailable
  }

  try {
    const { currentIndex } = presentation.getState();
    const answer = await askDeepSeek({
      apiKey: deepseekKey,
      question,
      slides: presentation.slides,
      currentIndex,
      history: chatHistory,
      model: els.deepseekModel.value.trim() || 'deepseek-v4-flash',
    });

    const speechText = sanitizeForSpeech(answer);
    chatHistory.push({ role: 'user', content: question });
    chatHistory.push({ role: 'assistant', content: speechText });
    if (chatHistory.length > 8) {
      chatHistory = chatHistory.slice(-8);
    }

    els.answerPreview.textContent = speechText;
    els.questionInput.value = '';
    log(`DeepSeek 回答：${speechText.slice(0, 60)}…`);

    await speakWithSdk(speechText);
  } catch (error) {
    presentation.finishQuestion();
    els.answerPreview.textContent = '';
    log(`问答失败：${error.message}`);
    alert(`问答失败：${error.message}`);
  } finally {
    isAsking = false;
    els.sendQuestionBtn.textContent = '发送';
    setControls({ connected: true, ready: true });
    if (isQuestionPanelOpen) {
      els.sendQuestionBtn.disabled = false;
    }
  }
}

async function speakText() {
  const text = els.textInput.value.trim();
  if (!sdk || !isReady) {
    alert('请先连接数字人');
    return;
  }
  if (!text) {
    alert('请输入要试播的文字');
    return;
  }

  presentation.stop();
  await unlockAudio();

  try {
    sdk.interactiveidle();
    setTimeout(() => {
      sdk.speak(text, true, true);
      log(`试播：${text}`);
    }, 300);
  } catch (error) {
    log(`试播失败：${error.message || error}`);
    alert(`试播失败：${error.message || error}`);
  }
}

async function startPresentation() {
  await unlockAudio();

  try {
    presentation.start();
  } catch (error) {
    alert(error.message);
  }
}

els.connectBtn.addEventListener('click', connectAvatar);
els.disconnectBtn.addEventListener('click', destroySdk);
els.speakBtn.addEventListener('click', speakText);
els.startBtn.addEventListener('click', startPresentation);
els.pauseBtn.addEventListener('click', () => presentation.pause());
els.resumeBtn.addEventListener('click', () => presentation.resume());
els.stopBtn.addEventListener('click', () => presentation.stop());
els.prevBtn.addEventListener('click', () => {
  try {
    presentation.prev();
  } catch (error) {
    alert(error.message);
  }
});
els.nextBtn.addEventListener('click', () => {
  try {
    presentation.next();
  } catch (error) {
    alert(error.message);
  }
});
els.interruptBtn.addEventListener('click', () => presentation.interrupt());

els.askToggleBtn.addEventListener('click', () => {
  if (isQuestionPanelOpen) {
    closeQuestionPanel();
    return;
  }
  openQuestionPanel();
});

els.questionCancelBtn.addEventListener('click', () => {
  closeQuestionPanel({ clearInput: true });
});

els.sendQuestionBtn.addEventListener('click', submitQuestion);

els.pptImportFile.addEventListener('change', () => {
  const file = els.pptImportFile.files?.[0];
  if (file) {
    els.pptImportMeta.textContent = `已选择：${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  }
});

els.pptImportBtn.addEventListener('click', async () => {
  const file = els.pptImportFile.files?.[0];
  if (!file) {
    alert('请先选择 .pptx 文件');
    return;
  }

  presentation.stop();
  isImporting = true;
  els.pptImportBtn.disabled = true;
  els.pptImportBtn.textContent = '解析中...';
  setControls({ connected: Boolean(sdk), ready: isReady });

  try {
    log(`开始解析 PPTX：${file.name}`);
    const data = await importPptx(file);
    presentation.loadSlides(data.slides);
    chatHistory = [];

    const imageHint = data.renderedWithLibreOffice
      ? '已生成页面图片'
      : '未检测到 LibreOffice，已使用文本版幻灯片（安装 LibreOffice + poppler 可导出图片）';
    els.pptImportMeta.textContent = `已导入 ${data.slideCount} 页 · ${data.fileName} · ${imageHint}`;
    log(`PPTX 导入成功：${data.slideCount} 页，${imageHint}`);
  } catch (error) {
    log(`PPTX 导入失败：${error.message}`);
    alert(`PPTX 导入失败：${error.message}`);
  } finally {
    isImporting = false;
    els.pptImportBtn.disabled = false;
    els.pptImportBtn.textContent = '解析并导入';
    setControls({ connected: Boolean(sdk), ready: isReady });
  }
});

els.questionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitQuestion();
  }
  if (event.key === 'Escape') {
    closeQuestionPanel({ clearInput: true });
  }
});

els.textInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    speakText();
  }
});

window.addEventListener('beforeunload', destroySdk);

restoreConfig();
presentation.reset();
setControls({ connected: false, ready: false });
initArchitectureModal();
initAvatarOrbit();
attachAudioUnlockListeners();
log('PPT 实时讲解 Demo 已就绪。请使用 localhost 或 https 访问。');
