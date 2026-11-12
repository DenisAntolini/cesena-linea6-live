const tunnelmole = require('tunnelmole/cjs');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Keep-alive timer per impedire la chiusura dell'event loop Node.js
const keepAlive = setInterval(() => {}, 30000);

async function runTunnel() {
  while (true) {
    try {
      console.log('Avvio/Riconnessione del tunnel pubblico Tunnelmole verso porta 3000...');
      const url = await tunnelmole({
        port: 3000
      });
      console.log('\n====================================================');
      console.log('APP PUBBLICA ONLINE CON SUCCESSO!');
      console.log('URL PUBBLICO HTTPS:');
      console.log(url);
      console.log('====================================================\n');

      // Attende prima di un eventuale retry se la promise si risolve
      await new Promise(r => setTimeout(r, 3600000));
    } catch (err) {
      console.error('Disconnessione o errore tunnel, riconnessione tra 5s:', err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

process.on('SIGINT', () => {
  clearInterval(keepAlive);
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(keepAlive);
  process.exit(0);
});

runTunnel();
