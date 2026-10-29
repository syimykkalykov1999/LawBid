// Runs web_decode.html in headless Chrome through the DevTools protocol and
// prints the result (no extra packages: Node's own fetch + WebSocket).
//   node web_decode.mjs   (google-chrome on PATH)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const page = 'file://' + join(dirname(fileURLToPath(import.meta.url)), 'web_decode.html');
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--remote-debugging-port=9333',
  '--user-data-dir=/tmp/lt-chrome', page], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs = [];
for (let i = 0; i < 50 && !tabs.length; i++) {
  await sleep(300);
  try { tabs = (await (await fetch('http://127.0.0.1:9333/json')).json()).filter((t) => t.type === 'page'); } catch {}
}
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let out = '';
for (let i = 0; i < 120 && (!out || out === 'running'); i++) {
  await sleep(500);
  out = await new Promise((resolve) => {
    ws.addEventListener('message', (m) => resolve(JSON.parse(m.data).result?.result?.value), { once: true });
    ws.send(JSON.stringify({ id: i + 1, method: 'Runtime.evaluate', params: { expression: "document.getElementById('out').textContent" } }));
  });
}
console.log(out);
ws.close();
chrome.kill();
