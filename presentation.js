import { DEFAULT_SLIDES, renderSlide } from './slides.js';
export function createPresentationController(deps) {
  const { sdkRef, isReadyRef, log, onSlideChange, onStateChange, onSubtitleChange } = deps;

  let slides = DEFAULT_SLIDES.map((slide) => ({ ...slide }));
  let currentIndex = 0;
  let mode = 'idle'; // idle | presenting | paused | qa
  let autoAdvanceEnabled = false;
  let advanceTimer = null;

  function getState() {
    return { mode, currentIndex, total: slides.length };
  }

  function notifyState() {
    onStateChange?.(getState());
  }

  function showSlide(index) {
    const slide = slides[index];
    if (!slide) return null;
    onSlideChange?.(renderSlide(slide), slide);
    notifyState();
    return slide;
  }

  function clearAdvanceTimer() {
    if (advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
  }

  function reset() {
    clearAdvanceTimer();
    mode = 'idle';
    currentIndex = 0;
    autoAdvanceEnabled = false;
    if (slides.length > 0) {
      showSlide(0);
    }
    notifyState();
  }

  function loadSlides(nextSlides) {
    if (!Array.isArray(nextSlides) || nextSlides.length === 0) {
      throw new Error('PPTX 解析结果为空');
    }

    slides = nextSlides.map((slide, index) => ({
      page: slide.page ?? index + 1,
      title: slide.title || `第 ${index + 1} 页`,
      bullets: slide.bullets || [],
      script: (slide.script || slide.title || '').trim(),
      image: slide.image || null,
    }));

    clearAdvanceTimer();
    mode = 'idle';
    currentIndex = 0;
    autoAdvanceEnabled = false;
    showSlide(0);
    log(`已导入 ${slides.length} 页 PPT 讲稿`);
    notifyState();
  }

  function ensureSdkReady() {
    if (!sdkRef() || !isReadyRef()) {
      throw new Error('请先连接数字人');
    }
  }

  function speakCurrentSlide() {
    const sdk = sdkRef();
    const slide = slides[currentIndex];
    if (!sdk || !slide) return;

    const script = slide.script || slide.title;
    if (!script) {
      log(`第 ${slide.page} 页没有讲稿，已跳过`);
      return;
    }

    sdk.speak(script, true, true);
    log(`讲解第 ${slide.page} 页：${script.slice(0, 36)}…`);
  }

  function scheduleNextSlide() {
    clearAdvanceTimer();
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      if (mode !== 'presenting') return;

      if (currentIndex >= slides.length - 1) {
        mode = 'idle';
        sdkRef()?.interactiveidle();
        log('讲解完成，已进入待机');
        notifyState();
        return;
      }

      currentIndex += 1;
      showSlide(currentIndex);
      speakCurrentSlide();
    }, 400);
  }

  function onVoiceEnd() {
    if (mode !== 'presenting' || !autoAdvanceEnabled) return;
    sdkRef()?.interactiveidle();
    scheduleNextSlide();
  }

  function start() {
    ensureSdkReady();
    clearAdvanceTimer();
    mode = 'presenting';
    autoAdvanceEnabled = true;
    currentIndex = 0;
    showSlide(0);
    speakCurrentSlide();
    log('开始 PPT 实时讲解');
    notifyState();
  }

  function pause() {
    if (mode !== 'presenting') return;
    mode = 'paused';
    autoAdvanceEnabled = false;
    clearAdvanceTimer();
    sdkRef()?.interactiveidle();
    log('讲解已暂停');
    notifyState();
  }

  function resume() {
    if (mode !== 'paused') return;
    mode = 'presenting';
    autoAdvanceEnabled = true;
    log(`从第 ${slides[currentIndex].page} 页继续讲解`);
    notifyState();
    setTimeout(() => speakCurrentSlide(), 400);
  }

  function stop() {
    clearAdvanceTimer();
    mode = 'idle';
    autoAdvanceEnabled = false;
    sdkRef()?.interactiveidle();
    log('讲解已停止');
    notifyState();
  }

  function interrupt() {
    autoAdvanceEnabled = false;
    clearAdvanceTimer();
    sdkRef()?.interactiveidle();
    onSubtitleChange?.('');
    log('已打断当前讲解');
  }

  function interruptForQuestion() {
    autoAdvanceEnabled = false;
    clearAdvanceTimer();
    sdkRef()?.interactiveidle();
    onSubtitleChange?.('');
    mode = 'qa';
    log('已进入问答模式，讲解已打断');
    notifyState();
  }

  function finishQuestion() {
    if (mode === 'qa') {
      mode = 'paused';
      notifyState();
    }
  }

  function speakExternal(text) {
    const sdk = sdkRef();
    if (!sdk || !text) return;
    sdk.speak(text, true, true);
  }

  function goTo(index, { autoSpeak = false, manual = false } = {}) {
    ensureSdkReady();
    const nextIndex = Math.max(0, Math.min(index, slides.length - 1));
    currentIndex = nextIndex;
    clearAdvanceTimer();
    sdkRef()?.interactiveidle();
    showSlide(currentIndex);

    if (manual) {
      autoAdvanceEnabled = false;
    }

    if (autoSpeak) {
      mode = 'presenting';
      setTimeout(() => speakCurrentSlide(), 400);
    }

    notifyState();
  }

  function prev() {
    goTo(currentIndex - 1, { autoSpeak: mode === 'presenting', manual: true });
  }

  function next() {
    goTo(currentIndex + 1, { autoSpeak: mode === 'presenting', manual: true });
  }

  function handleVoiceState(status) {
    if (status === 'voice_end' || status === 'end') {
      if (mode === 'qa') {
        finishQuestion();
        return;
      }
      onVoiceEnd();
    }
  }

  return {
    get slides() {
      return slides;
    },
    getState,
    loadSlides,
    start,
    pause,
    resume,
    stop,
    interrupt,
    interruptForQuestion,
    finishQuestion,
    speakExternal,
    prev,
    next,
    reset,
    handleVoiceState,
  };
}
