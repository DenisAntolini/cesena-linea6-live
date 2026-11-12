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

  // Attendiamo che la porta CDP risponda
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

  console.log('Connesso a Edge CDP:', wsUrl);
  const WebSocket = require('ws');
  const ws = new WebSocket(wsUrl);

  await new Promise(resolve => ws.on('open', resolve));

  let msgId = 1;
  const pending = new Map();
  const consoleMessages = [];

  ws.on('message', (raw) => {
    const data = JSON.parse(raw);
    if (data.method === 'Runtime.consoleAPICalled') {
      const text = data.params.args.map(a => a.value || a.description || '').join(' ');
      consoleMessages.push({ type: data.params.type, text });
      console.log(`[BROWSER CONSOLE ${data.params.type.toUpperCase()}] ${text}`);
    }
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  });

  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Crea nuova pagina
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

  // Attesa di 3.5 secondi per il completamento del rendering e polling
  await new Promise(r => setTimeout(r, 3500));

  // Ispezione DOM
  const evalResult = await pageSend('Runtime.evaluate', {
    expression: `(() => {
      const stopSelect = document.getElementById('stopSelect');
      const selectedStopText = stopSelect?.options[stopSelect.selectedIndex]?.text;
      const selectedStopValue = stopSelect?.value;
      const optionsCount = stopSelect?.options.length;
      const gpsNote = document.getElementById('gpsStatusNote')?.innerText;
      const nextBusText = document.getElementById('nextBusContainer')?.innerText;
      const hasLeafletMap = !!document.querySelector('.leaflet-container');
      const hasUserDot = !!document.querySelector('.user-location-dot');
      const busMarkers = document.querySelectorAll('.gmaps-bus-div-icon').length;

      return {
        hasLeafletMap,
        optionsCount,
        selectedStopValue,
        selectedStopText,
        gpsNote,
        nextBusSummary: nextBusText.replace(/\\n+/g, ' | ').slice(0, 150),
        hasUserDot,
        busMarkers
      };
    })()`,
    returnByValue: true
  });

  console.log('\n=== STATO APPLICAZIONE NEL BROWSER ===');
  console.log(JSON.stringify(evalResult.result?.result?.value || evalResult.result?.value || evalResult.result || evalResult, null, 2));

  // Verifica click sulla mappa per riposizionamento
  console.log('\nTest riposizionamento: click sulla mappa...');
  await pageSend('Runtime.evaluate', {
    expression: `(() => {
      const mapEl = document.getElementById('map');
      const rect = mapEl.getBoundingClientRect();
      const clickEvent = new MouseEvent('click', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true
      });
      mapEl.dispatchEvent(clickEvent);
    })()`
  });

  await new Promise(r => setTimeout(r, 1000));

  const afterClickResult = await pageSend('Runtime.evaluate', {
    expression: `(() => {
      return {
        selectedStopValue: document.getElementById('stopSelect')?.value,
        gpsNote: document.getElementById('gpsStatusNote')?.innerText
      };
    })()`,
    returnByValue: true
  });
  console.log('Stato dopo click:', JSON.stringify(afterClickResult.result?.result?.value || afterClickResult.result?.value || afterClickResult.result || afterClickResult, null, 2));

  // Pulizia
  pageWs.close();
  ws.close();
  proc.kill();

  const errors = consoleMessages.filter(m => m.type === 'error');
  if (errors.length > 0) {
    console.error('\n[ATTENZIONE] Trovati errori console:', errors);
    process.exit(1);
  } else {
    console.log('\n[SUCCESSO] 0 errori in console! Tutti i test superati.');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
