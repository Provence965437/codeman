import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { renderPptxToImages } from './pptx-render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_ROOT = path.join(__dirname, '../uploads');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // 必须为 false：true 时会把 r:id 与 id 合并，导致无法读取幻灯片关系 ID
  removeNSPrefix: false,
});

function findNode(obj, localName) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (obj[localName] !== undefined) return obj[localName];
  const key = Object.keys(obj).find((k) => !k.startsWith('@_') && (k === localName || k.endsWith(`:${localName}`)));
  return key ? obj[key] : undefined;
}

function getRelationshipId(node) {
  if (!node) return null;
  if (node['@_r:id']) return node['@_r:id'];
  const id = node['@_id'];
  if (typeof id === 'string' && /^rId\d+$/i.test(id)) return id;
  return null;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isTextNodeKey(key) {
  return key === 't' || key.endsWith(':t');
}

function collectAText(node, bucket = []) {
  if (node == null) return bucket;
  if (typeof node === 'string') return bucket;
  if (Array.isArray(node)) {
    node.forEach((item) => collectAText(item, bucket));
    return bucket;
  }
  if (typeof node === 'object') {
    Object.entries(node).forEach(([key, value]) => {
      if (key.startsWith('@_')) return;
      if (isTextNodeKey(key)) {
        if (typeof value === 'string' && value.trim()) {
          bucket.push(value.trim());
        }
        return;
      }
      collectAText(value, bucket);
    });
  }
  return bucket;
}

function readRelationshipMap(relsXml) {
  const doc = xmlParser.parse(relsXml);
  const relationships = asArray(doc?.Relationships?.Relationship);
  const map = new Map();
  for (const rel of relationships) {
    if (rel?.['@_Id'] && rel?.['@_Target']) {
      map.set(rel['@_Id'], rel['@_Target']);
    }
  }
  return map;
}

function resolveTarget(baseDir, target) {
  return path.posix.normalize(path.posix.join(baseDir, target));
}

async function readZipText(zip, entryPath) {
  const entry = zip.file(entryPath);
  if (!entry) return null;
  return entry.async('string');
}

function splitSlideTexts(texts) {
  const cleaned = texts.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return { title: '未命名幻灯片', bullets: [] };
  }
  return {
    title: cleaned[0],
    bullets: cleaned.slice(1),
  };
}

async function parsePptxStructure(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const presentationXml = await readZipText(zip, 'ppt/presentation.xml');
  if (!presentationXml) {
    throw new Error('无效的 PPTX：缺少 ppt/presentation.xml');
  }

  const presentationRelsXml = await readZipText(zip, 'ppt/_rels/presentation.xml.rels');
  const presentationRels = readRelationshipMap(presentationRelsXml);
  const presentationDoc = xmlParser.parse(presentationXml);
  const presentationRoot = findNode(presentationDoc, 'presentation');
  const slideIds = asArray(findNode(findNode(presentationRoot, 'sldIdLst'), 'sldId'));

  const slides = [];
  for (let index = 0; index < slideIds.length; index += 1) {
    const relId = getRelationshipId(slideIds[index]);
    const slideTarget = presentationRels.get(relId);
    if (!slideTarget) continue;

    const slidePath = resolveTarget('ppt', slideTarget);
    const slideXml = await readZipText(zip, slidePath);
    const slideTexts = collectAText(xmlParser.parse(slideXml || ''));
    const { title, bullets } = splitSlideTexts(slideTexts);

    let script = '';
    const slideRelPath = `ppt/slides/_rels/${path.posix.basename(slidePath)}.rels`;
    const slideRelsXml = await readZipText(zip, slideRelPath);
    if (slideRelsXml) {
      const slideRels = readRelationshipMap(slideRelsXml);
      const notesTarget = [...slideRels.values()].find((target) => target.includes('notesSlides/'));
      if (notesTarget) {
        const notesPath = resolveTarget('ppt/slides', notesTarget);
        const notesXml = await readZipText(zip, notesPath);
        const noteTexts = collectAText(xmlParser.parse(notesXml || ''));
        script = noteTexts.join('\n').trim();
      }
    }

    if (!script) {
      script = [title, ...bullets].filter(Boolean).join('。');
    }

    slides.push({
      page: index + 1,
      title,
      bullets,
      script,
    });
  }

  if (slides.length === 0) {
    throw new Error('PPTX 中未找到任何幻灯片');
  }

  return slides;
}

export async function parseAndStorePptx(buffer, originalName) {
  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionDir = path.join(UPLOAD_ROOT, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });

  const safeName = (originalName || 'presentation.pptx').replace(/[^\w.\-()\u4e00-\u9fa5]/g, '_');
  const pptxPath = path.join(sessionDir, safeName);
  await fs.writeFile(pptxPath, buffer);

  const slides = await parsePptxStructure(buffer);
  const imagePaths = await renderPptxToImages(pptxPath, sessionDir);

  const resultSlides = slides.map((slide, index) => {
    const imageFile = imagePaths?.[index];
    return {
      ...slide,
      image: imageFile ? `/api/presentation/assets/${sessionId}/${path.basename(imageFile)}` : null,
    };
  });

  return {
    sessionId,
    fileName: safeName,
    slideCount: resultSlides.length,
    renderedWithLibreOffice: Boolean(imagePaths?.length),
    slides: resultSlides,
  };
}

export { UPLOAD_ROOT };
