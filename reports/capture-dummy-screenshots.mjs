import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9345;
const outDir = 'C:\\shoudo-stopper\\reports\\screenshots\\dummy';
const userDataDir = `${process.env.TEMP || 'C:\\Temp'}\\shoudo-stopper-dummy-chrome`;

const COLORS = {
  main: '#3E5C76',
  sub: '#C8D6E5',
  background: '#FCFBF8',
  text: '#222222',
  accent: '#C97B63',
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(endpoint, options = {}) {
  const response = await fetch(endpoint, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${endpoint} ${response.status}`);
  }
  return response.json();
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const callbacks = new Map();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && callbacks.has(message.id)) {
      const { resolve, reject } = callbacks.get(message.id);
      callbacks.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  return {
    send(method, params = {}) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        callbacks.set(id, { resolve, reject });
      });
    },
    close() {
      socket.close();
    },
  };
}

function baseHtml(body) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 1242px;
      height: 2688px;
      background: ${COLORS.background};
      color: ${COLORS.text};
      font-family: "Noto Sans JP", "Yu Gothic", "Meiryo", sans-serif;
      letter-spacing: 0;
    }
    body { padding: 32px 32px 124px; }
    .kicker { color: ${COLORS.main}; font-size: 18px; font-weight: 700; margin-bottom: 12px; }
    h1 { color: ${COLORS.main}; font-size: 44px; line-height: 1.25; margin: 0 0 16px; font-weight: 700; }
    h2 { color: ${COLORS.text}; font-size: 28px; margin: 0; font-weight: 700; }
    .lead { font-size: 19px; line-height: 1.7; margin: 0 0 28px; }
    .card {
      border: 1px solid ${COLORS.sub};
      border-radius: 12px;
      padding: 24px;
      margin: 18px 0;
      background: ${COLORS.background};
    }
    .primary {
      background: ${COLORS.main};
      color: ${COLORS.background};
      border-radius: 12px;
      min-height: 68px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
      margin: 24px 0;
    }
    .outline {
      border: 1px solid ${COLORS.sub};
      border-radius: 12px;
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${COLORS.main};
      font-size: 18px;
      font-weight: 700;
    }
    .muted { color: ${COLORS.main}; font-size: 16px; font-weight: 700; }
    .big { font-size: 40px; font-weight: 700; color: ${COLORS.text}; margin-top: 8px; }
    .accent { color: ${COLORS.accent}; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .stack { display: grid; gap: 14px; }
    .record {
      border-top: 1px solid ${COLORS.sub};
      padding-top: 16px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px 16px;
      font-size: 18px;
    }
    .record:first-child { border-top: 0; padding-top: 0; }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid ${COLORS.sub};
      border-radius: 12px;
      min-height: 48px;
      padding: 0 18px;
      font-size: 17px;
      font-weight: 700;
      background: ${COLORS.background};
    }
    .selected { background: ${COLORS.main}; border-color: ${COLORS.main}; color: ${COLORS.background}; }
    .field {
      border: 1px solid ${COLORS.sub};
      border-radius: 12px;
      padding: 18px 20px;
      margin: 16px 0;
    }
    .field-title { font-size: 21px; font-weight: 700; margin-bottom: 14px; }
    .tabs {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 96px;
      border-top: 1px solid ${COLORS.sub};
      background: ${COLORS.background};
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      align-items: center;
      text-align: center;
      color: ${COLORS.text};
      font-size: 15px;
    }
    .tab-active { color: ${COLORS.main}; font-weight: 700; }
    .score { color: ${COLORS.accent}; font-size: 80px; line-height: 1; font-weight: 700; margin: 18px 0; }
    .center { text-align: center; }
    .result-title { font-size: 30px; font-weight: 700; }
    .detail { display: grid; gap: 16px; font-size: 18px; }
    .detail .row { border-top: 1px solid ${COLORS.sub}; padding-top: 14px; }
    .detail .row:first-child { border-top: 0; padding-top: 0; }
    .pro-panel {
      border: 1px solid ${COLORS.accent};
      border-radius: 12px;
      padding: 24px;
      margin-top: 18px;
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

const tabs = (active) => `
  <div class="tabs">
    <div class="${active === 'home' ? 'tab-active' : ''}">⌂<br />ホーム</div>
    <div class="${active === 'history' ? 'tab-active' : ''}">◷<br />履歴</div>
    <div class="${active === 'analysis' ? 'tab-active' : ''}">⌕<br />分析</div>
    <div class="${active === 'settings' ? 'tab-active' : ''}">⚙<br />設定</div>
  </div>`;

const screens = {
  '01-home': baseHtml(`
    <div class="kicker">衝動買いの前に3問チェック</div>
    <h1>衝動買いストッパー</h1>
    <p class="lead">欲しい気持ちを否定せず、買う前に一度だけ立ち止まるための小さな道具です。</p>
    <div class="primary">3問チェックを始める</div>
    <section class="card">
      <div class="muted">今月の推定節約額</div>
      <div class="big">¥23,450</div>
      <p class="lead" style="font-size:17px;margin:12px 0 0;">やめた買い物を記録すると、節約できた金額を自動で集計します。</p>
    </section>
    <section class="card">
      <div class="row" style="margin-bottom:18px;"><h2>直近の記録</h2><span class="muted">3件</span></div>
      <div class="stack">
        <div class="record"><div><b>ファッション</b><br /><span class="muted">セール ・ やめた</span></div><b>¥8,500</b></div>
        <div class="record"><div><b>ガジェット</b><br /><span class="muted">なんとなく ・ 保留</span></div><b>¥32,000</b></div>
        <div class="record"><div><b>コスメ</b><br /><span class="muted">SNS ・ 買った</span></div><b>¥3,200</b></div>
      </div>
    </section>
    ${tabs('home')}
  `),
  '02-check': baseHtml(`
    <div class="row" style="justify-content:flex-start;gap:16px;margin-bottom:20px;"><span class="pill">戻る</span><h2>3問チェック</h2></div>
    <section class="field">
      <div class="field-title">Q1. カテゴリ</div>
      <div class="row" style="justify-content:flex-start;flex-wrap:wrap;">
        <span class="pill">食品</span><span class="pill selected">ファッション</span><span class="pill">ガジェット</span><span class="pill">趣味</span><span class="pill">その他</span>
      </div>
    </section>
    <section class="field">
      <div class="field-title">Q2. 金額</div>
      <div class="pill selected">8500</div>
    </section>
    <section class="field">
      <div class="field-title">Q3. きっかけ</div>
      <div class="row" style="justify-content:flex-start;flex-wrap:wrap;">
        <span class="pill selected">セール</span><span class="pill">SNS</span><span class="pill">衝動</span><span class="pill">ずっと欲しかった</span><span class="pill">必要になった</span>
      </div>
    </section>
    <div class="primary">判定する</div>
    ${tabs('home')}
  `),
  '03-result': baseHtml(`
    <div class="row" style="justify-content:flex-start;gap:16px;margin-bottom:20px;"><span class="pill">戻る</span><h2>判定結果</h2></div>
    <section class="card center">
      <div class="muted">後悔しない確率</div>
      <div class="score">35%</div>
      <div class="result-title">やめた方がいい</div>
    </section>
    <section class="card detail">
      <div class="row"><span class="muted">カテゴリ</span><b>ファッション</b></div>
      <div class="row"><span class="muted">金額</span><b>¥8,500</b></div>
      <div class="row"><span class="muted">きっかけ</span><b>セール</b></div>
      <div class="row"><span class="muted">推定節約額</span><b class="accent">¥8,500</b></div>
    </section>
    <div class="row"><div class="outline" style="flex:1;">買う</div><div class="primary" style="flex:1;margin:0;">やめる</div><div class="outline" style="flex:1;">保留</div></div>
    ${tabs('home')}
  `),
  '04-history': baseHtml(`
    <div class="row" style="justify-content:flex-start;gap:16px;margin-bottom:20px;"><span class="pill">戻る</span><h2>履歴</h2></div>
    <section class="card">
      <div class="stack">
        <div class="record"><div><span class="muted">05/31</span><br /><b>ファッション</b><br />やめた</div><b>¥8,500</b></div>
        <div class="record"><div><span class="muted">05/28</span><br /><b>ガジェット</b><br />保留</div><b>¥32,000</b></div>
        <div class="record"><div><span class="muted">05/25</span><br /><b>コスメ</b><br />買った</div><b>¥3,200</b></div>
        <div class="record"><div><span class="muted">05/20</span><br /><b>食品</b><br />やめた</div><b>¥1,800</b></div>
        <div class="record"><div><span class="muted">05/18</span><br /><b>書籍</b><br />買った</div><b>¥2,500</b></div>
      </div>
    </section>
    ${tabs('history')}
  `),
  '05-pro-upgrade': baseHtml(`
    <div class="row" style="justify-content:flex-start;gap:16px;margin-bottom:20px;"><span class="pill">戻る</span><h2>Pro案内</h2></div>
    <section class="card">
      <div class="muted">節約カウンター</div>
      <div class="big">¥23,450</div>
      <p class="lead" style="font-size:17px;margin:12px 0 0;">履歴タイムライン、節約カウンター、パターン分析、CSVエクスポートが使えるようになります。</p>
    </section>
    <section class="pro-panel">
      <h2>Pro版で記録と分析を解放</h2>
      <p class="lead" style="font-size:17px;margin:12px 0 20px;">買い切りで、保存件数と分析機能を広げられます。</p>
      <div class="primary">Pro版にアップグレード</div>
    </section>
    ${tabs('settings')}
  `),
};

async function capture(cdp, name, html) {
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await cdp.send('Page.navigate', { url: dataUrl });
  await delay(900);
  const image = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await writeFile(`${outDir}/${name}.png`, Buffer.from(image.data, 'base64'));
  console.log(`${name}.png`);
}

await mkdir(outDir, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--window-size=1242,2688',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' });

try {
  for (let i = 0; i < 40; i += 1) {
    try {
      await getJson(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch {
      await delay(250);
    }
  }

  const target = await getJson(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' });
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1242,
    height: 2688,
    deviceScaleFactor: 1,
    mobile: true,
  });

  for (const [name, html] of Object.entries(screens)) {
    await capture(cdp, name, html);
  }
  cdp.close();
} finally {
  chrome.kill();
}
