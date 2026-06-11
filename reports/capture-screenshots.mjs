import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9335;
const outDir = 'C:\\shoudo-stopper\\reports\\screenshots';
const url = 'http://127.0.0.1:3005/';
const userDataDir = `${process.env.TEMP || 'C:\\Temp'}\\shoudo-stopper-chrome-profile`;

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

async function waitForPageLoad(cdp) {
  for (let i = 0; i < 80; i += 1) {
    const result = await cdp.send('Runtime.evaluate', {
      expression:
        'location.href.startsWith("http://127.0.0.1:3005/") && document.readyState === "complete" && document.body && document.body.innerText.length > 20',
      returnByValue: true,
    });
    if (result.result.value) return;
    await delay(250);
  }
  const current = await cdp.send('Runtime.evaluate', {
    expression: 'location.href',
    returnByValue: true,
  });
  throw new Error(`Timed out waiting for app page: ${current.result.value}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result.value;
}

async function clickText(cdp, text) {
  await evaluate(
    cdp,
    `(() => {
      const targetText = ${JSON.stringify(text)};
      const candidates = Array.from(document.querySelectorAll('[role="button"], button, a, div, span'));
      const target = candidates.find((el) => (el.innerText || el.textContent || '').trim() === targetText);
      if (!target) throw new Error('Text not found: ' + targetText);
      target.click();
      return true;
    })()`,
  );
  await delay(900);
}

async function clickContains(cdp, text) {
  await evaluate(
    cdp,
    `(() => {
      const targetText = ${JSON.stringify(text)};
      const candidates = Array.from(document.querySelectorAll('[role="button"], button, a, div, span'));
      const target = candidates.find((el) => (el.innerText || el.textContent || '').includes(targetText));
      if (!target) throw new Error('Text not found: ' + targetText);
      target.click();
      return true;
    })()`,
  );
  await delay(900);
}

async function clickAt(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await delay(900);
}

async function capture(cdp, name) {
  await delay(700);
  const image = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await writeFile(`${outDir}/${name}.png`, Buffer.from(image.data, 'base64'));
  console.log(`${name}.png`);
}

async function seedHistory(cdp) {
  const records = Array.from({ length: 5 }, (_, index) => ({
    id: `sample-${index + 1}`,
    createdAt: new Date(Date.now() - index * 86400000).toISOString(),
    category: ['food', 'fashion', 'gadget', 'hobby', 'other'][index],
    priceRange: ['under_1000', '1001_5000', '5001_20000', 'over_20001', '1001_5000'][index],
    trigger: ['sale', 'sns', 'impulse', 'wanted_long_time', 'necessary'][index],
    score: [35, 50, 60, 75, 85][index],
    label: ['見送り推奨', '保留推奨', '少し時間を置くとよい買い物', '少し時間を置くとよい買い物', '後悔しにくい買い物'][index],
    comment: 'スクリーンショット用のサンプル記録です。',
    action: ['skip', 'hold', 'skip', 'hold', 'skip'][index],
    estimatedSavedAmount: [500, 3000, 12500, 25000, 3000][index],
  }));
  await evaluate(
    cdp,
    `localStorage.setItem('shoudo_stop_purchase_checks', ${JSON.stringify(JSON.stringify(records))}); true`,
  );
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

  const target = await getJson(`http://127.0.0.1:${port}/json/new`, {
    method: 'PUT',
  });
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1242,
    height: 2688,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await cdp.send('Page.navigate', { url });
  await waitForPageLoad(cdp);
  await seedHistory(cdp);
  await cdp.send('Page.reload');
  await waitForPageLoad(cdp);
  await delay(2000);

  await capture(cdp, '01-home');

  await clickAt(cdp, 621, 218);
  await capture(cdp, '02-check');

  await clickAt(cdp, 65, 164);
  await clickAt(cdp, 150, 286);
  await clickAt(cdp, 132, 413);
  await clickAt(cdp, 621, 505);
  await capture(cdp, '03-result');

  await clickAt(cdp, 621, 500);
  await delay(1200);
  await capture(cdp, '05-pro-upgrade');

  await cdp.send('Page.navigate', { url });
  await waitForPageLoad(cdp);
  await delay(1200);
  await clickAt(cdp, 210, 450);
  await capture(cdp, '04-history-locked');

  cdp.close();
} finally {
  chrome.kill();
}
