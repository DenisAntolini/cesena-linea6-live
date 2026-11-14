const { spawn } = require('child_process');
const path = require('path');

const binPath = path.join(__dirname, '..', 'node_modules', 'cloudflared', 'bin', 'cloudflared.exe');

console.log('Avvio del tunnel Cloudflare stabile verso http://localhost:3000...');

function run() {
  const proc = spawn(binPath, ['tunnel', '--url', 'http://localhost:3000'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let urlFound = false;

  function parseOutput(data) {
    const text = data.toString();
    process.stderr.write(text);

    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match && !urlFound) {
      urlFound = true;
      const url = match[0];
      console.log('\n====================================================');
      console.log('CLOUDFLARE TUNNEL ONLINE CON SUCCESSO!');
      console.log('URL PUBBLICO HTTPS:');
      console.log(url);
      console.log('====================================================\n');
    }
  }

  proc.stdout.on('data', parseOutput);
  proc.stderr.on('data', parseOutput);

  proc.on('close', (code) => {
    console.log(`Cloudflared terminato con codice ${code}. Riavvio tra 5 secondi...`);
    setTimeout(run, 5000);
  });
}

run();
