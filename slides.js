/** 默认示例讲稿：导入 PPTX 后会被替换 */
export const DEFAULT_SLIDES = [
  {
    page: 1,
    title: '产品方案概览',
    bullets: [
      '面向企业培训与展厅讲解场景',
      '数字人实时驱动 + 幻灯片同步展示',
      '支持打断、暂停与手动翻页',
    ],
    script:
      '大家好，欢迎收看本次产品方案讲解。接下来我将从应用场景、技术架构和落地步骤三个方面，为您介绍这套数字人实时讲解方案。',
  },
  {
    page: 2,
    title: '核心应用场景',
    bullets: ['企业内训与知识传播', '展厅接待与产品路演', '在线课程与直播互动'],
    script:
      '第二页我们来看核心应用场景。这套方案特别适合企业内训、展厅讲解，以及需要数字人出镜的在线课程和直播互动场景。',
  },
  {
    page: 3,
    title: '技术架构',
    bullets: [
      '前端：幻灯片播放器 + 魔珐星云 JS SDK',
      '驱动：speak 接口按页播报讲稿',
      '同步：voice_end 事件触发自动翻页',
    ],
    script:
      '第三页是技术架构。前端负责展示幻灯片并调用 speak 接口驱动数字人说话；当一页讲解结束，系统监听语音结束事件，再自动切换到下一页继续讲解。',
  },
  {
    page: 4,
    title: '落地步骤',
    bullets: [
      '1. 上传 PPT，解析为「图片 + 讲稿」',
      '2. 配置 App ID / Secret 连接数字人',
      '3. 点击开始讲解，支持问答扩展',
    ],
    script:
      '最后一页是落地步骤。先将 PPT 解析成每页图片和对应讲稿，再连接数字人 SDK，点击开始讲解即可。后续还可以接入大模型，实现讲解过程中的智能问答。感谢您的聆听！',
  },
];

export function renderSlide(slide) {
  if (slide.image) {
    return `<img class="slide-image" src="${slide.image}" alt="第 ${slide.page} 页 ${slide.title}" />`;
  }

  const bullets = (slide.bullets || []).map((item) => `<li>${item}</li>`).join('');
  return `
    <article class="slide-card">
      <p class="slide-page">第 ${slide.page} 页</p>
      <h2 class="slide-title">${slide.title}</h2>
      <ul class="slide-bullets">${bullets}</ul>
    </article>
  `;
}
