import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOFFICE_CANDIDATES = [
  'soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/Applications/OpenOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
];

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(candidates) {
  for (const candidate of candidates) {
    if (candidate.includes('/') && (await pathExists(candidate))) {
      return candidate;
    }
    if (!candidate.includes('/')) {
      try {
        const { stdout } = await execFileAsync('which', [candidate]);
        const resolved = stdout.trim();
        if (resolved) return resolved;
      } catch {
        // try next
      }
    }
  }
  return null;
}

async function convertPptxToPdf(soffice, pptxPath, outDir) {
  await execFileAsync(
    soffice,
    ['--headless', '--nologo', '--nofirststartwizard', '--convert-to', 'pdf', '--outdir', outDir, pptxPath],
    { timeout: 120000 },
  );

  const baseName = path.basename(pptxPath, path.extname(pptxPath));
  const pdfPath = path.join(outDir, `${baseName}.pdf`);
  if (!(await pathExists(pdfPath))) {
    throw new Error('LibreOffice 未生成 PDF 文件');
  }
  return pdfPath;
}

async function convertPdfToPngsWithPdftoppm(pdfPath, outDir) {
  const pdftoppm = await findExecutable(['pdftoppm', '/usr/local/bin/pdftoppm', '/opt/homebrew/bin/pdftoppm']);
  if (!pdftoppm) return null;

  const prefix = path.join(outDir, 'slide');
  await execFileAsync(pdftoppm, ['-png', '-r', '160', pdfPath, prefix], { timeout: 120000 });
  return collectSlidePngs(outDir);
}

async function convertPdfToPngsWithPyMuPDF(pdfPath, outDir) {
  const python = await findExecutable(['python3', 'python', '/usr/bin/python3']);
  if (!python) return null;

  const scriptPath = path.join(__dirname, 'pdf-to-png.py');
  try {
    await execFileAsync(python, [scriptPath, pdfPath, outDir], { timeout: 120000 });
    return collectSlidePngs(outDir);
  } catch {
    return null;
  }
}

async function collectSlidePngs(outDir) {
  const files = await fs.readdir(outDir);
  const pngs = files
    .filter((name) => /^slide-\d+\.png$/i.test(name))
    .sort((a, b) => {
      const ai = Number(a.match(/(\d+)/)?.[1] || 0);
      const bi = Number(b.match(/(\d+)/)?.[1] || 0);
      return ai - bi;
    })
    .map((name) => path.join(outDir, name));

  return pngs.length > 0 ? pngs : null;
}

async function convertPdfToPngs(pdfPath, outDir) {
  const viaPoppler = await convertPdfToPngsWithPdftoppm(pdfPath, outDir);
  if (viaPoppler) return viaPoppler;

  const viaPyMuPDF = await convertPdfToPngsWithPyMuPDF(pdfPath, outDir);
  if (viaPyMuPDF) return viaPyMuPDF;

  throw new Error('未找到 pdftoppm（brew install poppler）或 pymupdf（pip install pymupdf）');
}

export async function renderPptxToImages(pptxPath, outDir) {
  try {
    const soffice = await findExecutable(SOFFICE_CANDIDATES);
    if (!soffice) {
      console.warn('[pptx-render] 未找到 LibreOffice，将仅解析备注与文本，不生成页面图片');
      return null;
    }

    const pdfPath = await convertPptxToPdf(soffice, pptxPath, outDir);
    const pngPaths = await convertPdfToPngs(pdfPath, outDir);
    return pngPaths;
  } catch (error) {
    console.warn('[pptx-render] 页面转图片失败：', error.message);
    return null;
  }
}
