const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const BACKGROUND = '#FCFBF8';
const MAIN_COLOR = '#1A1A2E';
const SUB_COLOR = '#6B7280';
const MAIN_FONT_SIZE = 36;
const SUB_FONT_SIZE = 24;
const SIDE_PADDING = 56;
const LINE_GAP = 16;

const rootDir = __dirname;
const outputDir = path.join(rootDir, 'output');

const screenshots = [
  {
    file: '01_home.png',
    main: '買う前に、一度だけ立ち止まる',
    sub: '衝動買いチェックで後悔を防ぐ',
  },
  {
    file: '02_check.png',
    main: '3つの質問に答えるだけ',
    sub: 'カテゴリ・金額・きっかけを選ぶ',
  },
  {
    file: '03_result.png',
    main: '後悔しない確率を即座に判定',
    sub: '4段階のコメントで判断をサポート',
  },
  {
    file: '04_history.png',
    main: '節約した金額が積み上がっていく',
    sub: '有料版で全履歴と節約額を記録',
  },
  {
    file: '05_analysis.png',
    main: '自分の衝動買いパターンがわかる',
    sub: 'カテゴリ・きっかけ別に傾向を分析',
  },
];

function registerFonts() {
  const fontCandidates = [
    {
      family: 'Noto Sans JP',
      path: path.join(
        process.env.LOCALAPPDATA || '',
        'Microsoft',
        'Windows',
        'Fonts',
        'NotoSansJP-Regular.ttf',
      ),
    },
    {
      family: 'Noto Sans JP',
      path: 'C:\\Windows\\Fonts\\NotoSansJP-Regular.ttf',
    },
    {
      family: 'Noto Sans JP',
      path: 'C:\\Windows\\Fonts\\NotoSansCJKjp-Regular.otf',
    },
    {
      family: 'Noto Sans JP',
      path: 'C:\\Windows\\Fonts\\meiryo.ttc',
    },
  ];

  for (const font of fontCandidates) {
    try {
      GlobalFonts.registerFromPath(font.path, font.family);
    } catch {
      // Fall through to the next local font candidate.
    }
  }
}

function fitText(ctx, text, maxWidth, fontWeight, fontSize, family) {
  let size = fontSize;
  do {
    ctx.font = `${fontWeight} ${size}px "${family}"`;
    if (ctx.measureText(text).width <= maxWidth || size <= 18) {
      return size;
    }
    size -= 1;
  } while (size > 0);
  return size;
}

function createHeaderOverlay({ width, height, main, sub }) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const fontFamily = 'Noto Sans JP, Meiryo, sans-serif';
  const maxTextWidth = width - SIDE_PADDING * 2;

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  const mainSize = fitText(ctx, main, maxTextWidth, '700', MAIN_FONT_SIZE, fontFamily);
  const subSize = fitText(ctx, sub, maxTextWidth, '400', SUB_FONT_SIZE, fontFamily);
  const totalTextHeight = mainSize + LINE_GAP + subSize;
  const startY = Math.round((height - totalTextHeight) / 2);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.font = `700 ${mainSize}px "${fontFamily}"`;
  ctx.fillStyle = MAIN_COLOR;
  ctx.fillText(main, width / 2, startY);

  ctx.font = `400 ${subSize}px "${fontFamily}"`;
  ctx.fillStyle = SUB_COLOR;
  ctx.fillText(sub, width / 2, startY + mainSize + LINE_GAP);

  return canvas.toBuffer('image/png');
}

async function addOverlay({ file, main, sub }) {
  const inputPath = path.join(rootDir, file);
  const outputPath = path.join(outputDir, file);
  const input = sharp(inputPath);
  const metadata = await input.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`${file}: image size could not be read`);
  }

  const headerHeight = Math.round(metadata.height * 0.2);
  const header = createHeaderOverlay({
    width: metadata.width,
    height: headerHeight,
    main,
    sub,
  });

  await sharp({
    create: {
      width: metadata.width,
      height: metadata.height + headerHeight,
      channels: 4,
      background: BACKGROUND,
    },
  })
    .composite([
      { input: header, left: 0, top: 0 },
      { input: await input.png().toBuffer(), left: 0, top: headerHeight },
    ])
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function main() {
  registerFonts();
  await fs.mkdir(outputDir, { recursive: true });

  const outputs = [];
  for (const screenshot of screenshots) {
    outputs.push(await addOverlay(screenshot));
  }

  console.log('Generated screenshots:');
  for (const output of outputs) {
    console.log(`- ${output}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
