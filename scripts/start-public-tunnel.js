const tunnelmole = require('tunnelmole/cjs');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function start() {
  console.log('Avvio del tunnel pubblico Tunnelmole verso porta 3000...');
  try {
    const url = await tunnelmole({
      port: 3000
    });
    console.log('\n====================================================');
    console.log('APP PUBBLICA ONLINE CON SUCCESSO!');
    console.log('URL PUBBLICO HTTPS:');
    console.log(url);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Errore avvio tunnel:', err);
  }
}

start();
