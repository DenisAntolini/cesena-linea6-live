const localtunnel = require('localtunnel');

(async () => {
  try {
    console.log('Apertura tunnel pubblico localtunnel per porta 3000...');
    const tunnel = await localtunnel({
      port: 3000,
      local_host: '127.0.0.1',
      subdomain: `cesena-linea6-${Math.floor(1000 + Math.random() * 9000)}`
    });

    console.log('\n====================================================');
    console.log('TUNNEL PUBBLICO ATTIVO:');
    console.log(tunnel.url);
    console.log('====================================================\n');

    tunnel.on('close', () => {
      console.log('[Tunnel] Chiuso.');
    });

    tunnel.on('error', (err) => {
      console.error('[Tunnel] Errore:', err);
    });

    // Mantieni il processo attivo
    setInterval(() => {}, 60000);
  } catch (err) {
    console.error('Errore creazione tunnel:', err);
  }
})();
