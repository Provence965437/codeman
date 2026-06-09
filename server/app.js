import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import { parsePptFile, createRenderTask, getRenderTask } from './xingyun.js';
import { chatCompletion } from './deepseek.js';
import { buildSystemPrompt } from './chat-prompt.js';
import { parseAndStorePptx, UPLOAD_ROOT } from './pptx-parser.js';

function readCredentials(req) {
  const appId = req.headers['x-app-id'] || req.body?.appId;
  const appSecret = req.headers['x-app-secret'] || req.body?.appSecret;
  if (!appId || !appSecret) {
    const error = new Error('缺少 App ID 或 App Secret');
    error.status = 400;
    throw error;
  }
  return { appId: String(appId).trim(), appSecret: String(appSecret).trim() };
}

export function createApp() {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
      const ok =
        file.originalname.toLowerCase().endsWith('.pptx') ||
        file.mimetype ===
          'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      cb(ok ? null : new Error('仅支持 .pptx 文件'), ok);
    },
  });

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/video/parse-ppt', upload.single('ppt_file'), async (req, res) => {
    try {
      const { appId, appSecret } = readCredentials(req);
      if (!req.file) {
        return res.status(400).json({ error: '请上传 PPT 文件' });
      }

      const data = await parsePptFile(appId, appSecret, req.file.buffer, req.file.originalname);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'PPT 解析失败' });
    }
  });

  app.post('/api/presentation/parse-pptx', upload.single('ppt_file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '请上传 .pptx 文件' });
      }

      const data = await parseAndStorePptx(req.file.buffer, req.file.originalname);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'PPTX 解析失败' });
    }
  });

  app.use('/api/presentation/assets', express.static(UPLOAD_ROOT));

  app.post('/api/video/render', async (req, res) => {
    try {
      const { appId, appSecret } = readCredentials(req);
      const {
        parse_ppt_file_name,
        look_name,
        tts_vcn_name,
        studio_name,
        video_name,
        sub_title = 'on',
        output_resolution = '720P',
        if_aigc_mark = true,
      } = req.body;

      if (!parse_ppt_file_name || !look_name || !tts_vcn_name || !studio_name) {
        return res.status(400).json({
          error: '缺少必填参数：parse_ppt_file_name、look_name、tts_vcn_name、studio_name',
        });
      }

      const data = await createRenderTask(appId, appSecret, {
        parse_ppt_file_name,
        look_name,
        tts_vcn_name,
        studio_name,
        video_name,
        sub_title,
        output_resolution,
        if_aigc_mark,
      });

      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || '创建渲染任务失败' });
    }
  });

  app.get('/api/video/task/:taskId', async (req, res) => {
    try {
      const { appId, appSecret } = readCredentials(req);
      const taskId = Number(req.params.taskId);
      if (!taskId) {
        return res.status(400).json({ error: '无效的任务 ID' });
      }

      const data = await getRenderTask(appId, appSecret, taskId);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || '查询任务失败' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const apiKey = req.headers['x-deepseek-key'] || process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: '缺少 DeepSeek API Key，请在页面填写或配置 DEEPSEEK_API_KEY 环境变量',
        });
      }

      const { question, slides = [], currentIndex = 0, history = [], model = 'deepseek-v4-flash' } =
        req.body;

      if (!question?.trim()) {
        return res.status(400).json({ error: '问题不能为空' });
      }
      if (!Array.isArray(slides) || slides.length === 0) {
        return res.status(400).json({ error: '缺少 PPT 内容上下文' });
      }

      const safeIndex = Math.max(0, Math.min(Number(currentIndex) || 0, slides.length - 1));
      const systemPrompt = buildSystemPrompt(slides, safeIndex);
      const recentHistory = Array.isArray(history)
        ? history.slice(-6).filter((item) => item?.role && item?.content)
        : [];

      const messages = [
        { role: 'system', content: systemPrompt },
        ...recentHistory,
        { role: 'user', content: question.trim() },
      ];

      const answer = await chatCompletion({ apiKey, messages, model });
      res.json({ ok: true, answer });
    } catch (error) {
      res.status(500).json({ error: error.message || '问答请求失败' });
    }
  });

  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: error.message || '服务器错误' });
  });

  return app;
}
