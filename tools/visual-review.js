/**
 * Visual review helper.
 *
 * Default:
 *   npm run review
 * Captures current screenshots and writes a Gemini/Claude-ready review prompt.
 *
 * Optional API mode:
 *   GEMINI_API_KEY=... npm run review:gemini
 * Sends selected reference/current screenshots to Gemini and saves the response.
 */

const childProcess = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOT_ROOT = path.join(ROOT, 'screenshots');
const REVIEW_ROOT = path.join(ROOT, 'reviews');
const REF_DIR = path.join(ROOT, '参考图');
const PRD_PATH = path.join(ROOT, 'PRD.md');
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
const useApi = process.argv.includes('--api');
const skipCapture = process.argv.includes('--skip-capture');

const PAIRS = [
  {
    key: 'opening',
    title: '开屏门厅',
    reference: '0-开屏场景参考.png',
    current: '01-opening.png',
    focus: '门是否是第一视觉中心；纸板空间是否可读；暖光、尘埃、暗角是否接近参考；门高、把手、墙体厚度是否像人眼尺度。',
  },
  {
    key: 'prep',
    title: '准备室工作台',
    reference: '1-准备室场景参考.png',
    current: '02-prep-room.png',
    focus: '桌面尺度、天窗体积光、手稿墙、耳机/VR发光边线、背景工作室层次；耳机约20cm、VR约18cm、CRT约60-75cm、桌高约85cm是否可信。',
  },
  {
    key: 'hand-hp',
    title: '耳机佩戴手部中段',
    reference: '7-手部参考.png',
    current: '04a-prep-hp-hand-mid.png',
    focus: '双手是否像从第一人称视角自然伸出；是否穿桌；前臂是否过长/过粗；手掌是否朝向耳机并有抓取意图。',
  },
  {
    key: 'hand-vr',
    title: 'VR 佩戴手部中段',
    reference: '7-手部参考.png',
    current: '04b-prep-vr-hand-mid.png',
    focus: '双手是否朝向 VR 眼镜；是否穿桌或穿过纸片；VR 是否放在桌面上而非嵌入桌面；动作是否像戴上设备。',
  },
  {
    key: 'zone1',
    title: '区域 1 高分辨率',
    reference: '2-空间参考图1.png',
    current: '05-zone1.png',
    focus: '纸板建筑体块、强烈但不过曝的光影、空间纵深和可导航门；门、柱、桌、行走高度是否符合1.6m人眼视角。',
  },
  {
    key: 'zone2',
    title: '区域 2 过曝',
    reference: '3-空间参考图2.png',
    current: '05-zone2.png',
    focus: '红青撕裂、焦灼感、仍保留结构识别度，避免纯特效盖住空间；狭窄通道宽度是否像人能走过而不是模型缝隙。',
  },
  {
    key: 'zone3',
    title: '区域 3 失焦',
    reference: '4-空间参考图3.png',
    current: '06-zone3.png',
    focus: '雾、水气、软边和低对比，不要变成空白蓝灰盒子；水面、灯、纸片和门的尺度关系是否可信。',
  },
  {
    key: 'zone4',
    title: '区域 4 重新对焦',
    reference: '5-空间参考图4.png',
    current: '07-zone4.png',
    focus: '线稿从建筑表面浮现，蓝图/网格有建筑感而不是纯科幻 UI；线稿门框和墙面标注是否仍有建筑尺度。',
  },
  {
    key: 'zone5',
    title: '区域 5 景深',
    reference: '6-空间参考图5.png',
    current: '08-zone5.png',
    focus: '纸板和线框并置，白光出口有深度，整体平静而非灰暗；出口门、明信片、地面纸板模块是否符合人眼尺度。',
  },
];

function latestScreenshotDir() {
  if (!fs.existsSync(SHOT_ROOT)) return null;
  const dirs = fs.readdirSync(SHOT_ROOT)
    .filter((name) => fs.statSync(path.join(SHOT_ROOT, name)).isDirectory())
    .sort();
  return dirs.length ? path.join(SHOT_ROOT, dirs[dirs.length - 1]) : null;
}

function runCapture() {
  console.log('Capturing current scenes...');
  childProcess.execFileSync('node', ['tools/capture.js'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function rel(filePath) {
  return path.relative(ROOT, filePath);
}

function existingPairs(currentDir) {
  return PAIRS.map((pair) => {
    const ref = path.join(REF_DIR, pair.reference);
    const cur = path.join(currentDir, pair.current);
    return { ...pair, ref, cur, exists: fs.existsSync(ref) && fs.existsSync(cur) };
  });
}

function buildPrompt(pairs) {
  const prd = fs.existsSync(PRD_PATH) ? fs.readFileSync(PRD_PATH, 'utf-8') : '';
  const prdExcerpt = prd
    ? prd.slice(0, 16000)
    : 'PRD.md not found.';
  const usable = pairs.filter((pair) => pair.exists);
  const missing = pairs.filter((pair) => !pair.exists);
  const imageList = usable.map((pair, index) => [
    `${index + 1}. ${pair.title}`,
    `   参考图: ${rel(pair.ref)}`,
    `   当前图: ${rel(pair.cur)}`,
    `   重点: ${pair.focus}`,
  ].join('\n')).join('\n\n');
  const missingList = missing.length
    ? `\n\n缺失图片，不要评价这些场景:\n${missing.map((pair) => `- ${pair.title}: ${rel(pair.ref)} / ${rel(pair.cur)}`).join('\n')}`
    : '';

  return `你是一个资深 3D 交互网页视觉导演和 Three.js 工程 reviewer。请对 dreamcore-space 进行视觉 review。

项目目标：
- 单文件 HTML + Three.js 的沉浸式 3D 叙事体验。
- 风格是纸板建筑模型、手稿/线稿、暖色体积光、梦核暗角、可进入的记忆空间。
- 当前问题通常不是某个材质，而是整体空间读不出来、光照层次弱、参考图的手稿/纸板质感不够。
- 第一人称人眼尺度非常重要：默认相机高度约 1.55-1.6m；桌高约 0.75-0.9m；普通门高约 2.0-2.3m；耳机约 18-22cm；VR眼镜约 16-20cm；CRT显示器约 60-75cm 宽。请主动指出任何像玩具、雕塑、舞台布景或巨型模型的比例问题。
- 每轮 review 必须同时检查 PRD 一致性：如果代码实现或视觉方向已经偏离 PRD，请指出；如果 PRD 已经落后于新的工程决策，请给出可直接合并到 PRD.md 的更新建议。

PRD 摘要（截取前 16000 字，作为本轮约束）：
${prdExcerpt}

请对每组图片做对比，只输出可执行的工程建议，不要泛泛赞美。

输出格式：
1. Overall Diagnosis: 用 5-8 条说明最大差距，按影响排序。
2. Scene Findings: 每个场景列 3-5 条具体问题。
3. Human-Scale Audit: 单独列出第一人称尺度问题，必须覆盖相机高度、桌/门/物件大小、可行走空间宽度、视觉焦距/视角是否造成比例误判。
4. PRD Consistency: 列出实现与 PRD 符合/冲突/PRD 需要更新的点。
5. PRD Patch Suggestions: 如果需要更新 PRD，给出 Markdown 小节或 bullet，可直接复制进 PRD.md。
6. Patch Plan: 给出下一轮代码修改清单，必须映射到 index.html 中可能的函数，例如 buildOpeningScene、buildPrepRoom、buildZone1-5、DreamcoreShader、lighting/postprocessing。
7. Risk Check: 指出可能引入的性能、可读性、交互 bug。
8. Stop Criteria: 说明下一轮截图应该达到什么标准才算过关。

图片清单：
${imageList}${missingList}`;
}

function imagePart(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return {
    inline_data: {
      mime_type: mime,
      data: fs.readFileSync(filePath).toString('base64'),
    },
  };
}

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Gemini API ${res.statusCode}: ${raw}`));
          return;
        }
        try { resolve(JSON.parse(raw)); }
        catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runGemini(prompt, pairs, outDir) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required for --api mode.');
  }
  const parts = [{ text: prompt }];
  pairs.filter((pair) => pair.exists).forEach((pair) => {
    parts.push({ text: `\n\n[${pair.title}] reference image:` });
    parts.push(imagePart(pair.ref));
    parts.push({ text: `[${pair.title}] current screenshot:` });
    parts.push(imagePart(pair.cur));
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const response = await postJson(url, {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.35,
      topP: 0.9,
      maxOutputTokens: 8192,
    },
  });
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim()
    || JSON.stringify(response, null, 2);
  const fp = path.join(outDir, 'gemini-review.md');
  fs.writeFileSync(fp, text);
  return fp;
}

async function main() {
  if (!skipCapture) runCapture();
  const currentDir = latestScreenshotDir();
  if (!currentDir) throw new Error('No screenshot directory found.');

  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const outDir = path.join(REVIEW_ROOT, ts);
  fs.mkdirSync(outDir, { recursive: true });

  const pairs = existingPairs(currentDir);
  const prompt = buildPrompt(pairs);
  const promptPath = path.join(outDir, 'visual-review-prompt.md');
  fs.writeFileSync(promptPath, prompt);

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    model: MODEL,
    screenshotDir: rel(currentDir),
    prompt: rel(promptPath),
    pairs: pairs.map((pair) => ({
      key: pair.key,
      title: pair.title,
      reference: rel(pair.ref),
      current: rel(pair.cur),
      exists: pair.exists,
    })),
  }, null, 2));

  console.log(`Review prompt: ${rel(promptPath)}`);
  console.log(`Manifest: ${rel(manifestPath)}`);

  if (useApi) {
    console.log(`Sending visual review to ${MODEL}...`);
    const reviewPath = await runGemini(prompt, pairs, outDir);
    console.log(`Gemini review: ${rel(reviewPath)}`);
  } else {
    console.log('API mode skipped. Paste the prompt plus listed images into Gemini, or run: GEMINI_API_KEY=... npm run review:gemini');
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
