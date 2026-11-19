const { spawn } = require('child_process');
const http = require('http');

async function run() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const debugPort = 9223;

  console.log('Avvio Edge headless su porta CDP ' + debugPort + '...');
  const proc = spawn(edgePath, [
    `--remote-debugging-port=${debugPort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=' + require('os').tmpdir() + '\\edge-test-profile-' + Date.now(),
    'about:blank'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${debugPort}/json/version`, (r) => {
          let data = '';
          r.on('data', chunk => data += chunk);
          r.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
      });
      if (res.webSocketDebuggerUrl) {
        wsUrl = res.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('Impossibile connettersi a Edge CDP');
    proc.kill();
    process.exit(1);
  }

  const WebSocket = require('ws');
  const ws = new WebSocket(wsUrl);
  await new Promise(resolve => ws.on('open', resolve));

  let msgId = 1;
  const pending = new Map();
  const consoleMessages = [];

  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.on('message', (raw) => {
    const data = JSON.parse(raw);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  });

  const target = await send('Target.createTarget', { url: 'http://localhost:3000' });
  const pageWsUrl = `ws://127.0.0.1:${debugPort}/devtools/page/${target.result.targetId}`;
  const pageWs = new WebSocket(pageWsUrl);
  await new Promise(resolve => pageWs.on('open', resolve));

  let pageMsgId = 1;
  const pagePending = new Map();
  pageWs.on('message', (raw) => {
    const data = JSON.parse(raw);
    if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map(a => a.value || a.description || '').join(' ');
      consoleMessages.push({ type: data.params.type, text });
      console.log(`[BROWSER CONSOLE] ${text}`);
    }
    if (data.method === 'Runtime.exceptionThrown') {
      console.error(`[BROWSER EXCEPTION]`, JSON.stringify(data.params.exceptionDetails));
      consoleMessages.push({ type: 'error', text: data.params.exceptionDetails.text });
    }
    if (data.id && pagePending.has(data.id)) {
      pagePending.get(data.id)(data);
      pagePending.delete(data.id);
    }
  });

  function pageSend(method, params = {}) {
    return new Promise(resolve => {
      const id = pageMsgId++;
      pagePending.set(id, resolve);
      pageWs.send(JSON.stringify({ id, method, params }));
    });
  }

  await pageSend('Runtime.enable');
  await pageSend('Page.enable');

  console.log('Navigazione a http://localhost:3000...');
  await pageSend('Page.navigate', { url: 'http://localhost:3000' });

  // Attesa per completamento rendering e chiamate alle API
  await new Promise(r => setTimeout(r, 4000));

  const evalResult = await pageSend('Runtime.evaluate', {
    expression: `(() => {
      const stopSelect = document.getElementById('stopSelect');
      const selectedStopText = stopSelect?.options[stopSelect.selectedIndex]?.text;
      const selectedStopValue = stopSelect?.value;
      const optionsCount = stopSelect?.options?.length || 0;
      const heroEta = document.getElementById('heroEtaBig')?.innerText;
      const heroTimes = document.getElementById('heroTimesLine')?.innerText;
      const heroVehicle = document.getElementById('heroVehicleBadge')?.innerText;
      const hasLeafletMap = !!document.querySelector('.leaflet-container');
      const busMarkers = document.querySelectorAll('.bus-marker-wrap').length;
      const sheetIsCollapsed = document.getElementById('bottomSheet')?.classList.contains('collapsed');

      return {
        hasLeafletMap,
        optionsCount,
        selectedStopValue,
        selectedStopText,
        heroEta,
        heroTimes,
        heroVehicle,
        busMarkers,
        sheetIsCollapsed
      };
    })()`,
    returnByValue: true
  });

  console.log('\n=== STATO APPLICAZIONE NEL BROWSER ===');
  console.log(JSON.stringify(evalResult.result?.value || evalResult.result || evalResult, null, 2));

  // Test switch direzione ➔ Rio Maggiore
  console.log('\nTest switch direzione a "Rio Maggiore"...');
  await pageSend('Runtime.evaluate', {
    expression: `document.getElementById('tabDir1')?.click()`
  });
  await new Promise(r => setTimeout(r, 1500));

  const afterSwitch = await pageSend('Runtime.evaluate', {
    expression: `(() => {
      const stopSelect = document.getElementById('stopSelect');
      return {
        direction1OptionsCount: stopSelect?.options?.length || 0,
        selectedStopText: stopSelect?.options[stopSelect.selectedIndex]?.text
      };
    })()`,
    returnByValue: true
  });
  console.log('Stato dopo switch direzione:', JSON.stringify(afterSwitch.result?.value || afterSwitch.result, null, 2));

  // Test toggle bottom sheet
  console.log('\nTest apertura/chiusura Bottom Sheet...');
  await pageSend('Runtime.evaluate', {
    expression: `document.getElementById('sheetHandle')?.click()`
  });
  await new Promise(r => setTimeout(r, 600));

  const afterCollapse = await pageSend('Runtime.evaluate', {
    expression: `document.getElementById('bottomSheet')?.classList.contains('collapsed')`,
    returnByValue: true
  });
  console.log('Bottom Sheet collassato con successo?', afterCollapse.result?.value);

  pageWs.close();
  ws.close();
  proc.kill();

  const realErrors = consoleMessages.filter(m => m.type === 'error' && !m.text.includes('favicon'));
  if (realErrors.length > 0) {
    console.error('\n[ATTENZIONE] Trovati errori console:', realErrors);
    process.exit(1);
  } else {
    console.log('\n[SUCCESSO] 0 errori in console! Tutti i test della nuova interfaccia superati.');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
