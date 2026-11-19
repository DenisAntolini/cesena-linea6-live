const fs = require('fs');
const path = require('path');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const apiIndex = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');
const vercelJson = fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8');
const manifestJson = fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8');
const packageJson = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
const liveTracker = fs.readFileSync(path.join(__dirname, '..', 'services', 'liveTracker.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

const bundle = `# MEGA-PROMPT & CODEBASE BUNDLE: CESENA LINEA 6 LIVE
> **Istruzioni per l'utente**: Copia l'intero contenuto di questo file e incollalo direttamente nella chat di **Google Gemini** (Gemini Advanced, Gemini 2.0 Flash o Google AI Studio).
> Gemini ha una finestra di contesto fino a 1-2 Milioni di token, quindi leggerà tutto il codice in blocco con estrema facilità.

---

## 🤖 PROMPT DI SISTEMA / PERSONA PER GEMINI
\`\`\`text
Agisci come Principal Transit Architect & Senior Staff Full-Stack Engineer (Node.js, Express, Serverless, Leaflet.js, PWA, GTFS/Transit Geodata).

Stai lavorando sul progetto "Cesena Linea 6 Live" (Start Romagna), un'applicazione web moderna ad alta precisione per il monitoraggio in tempo reale degli autobus urbani della Linea 6 di Cesena (Rio Maggiore - Stazione FS - Campus Universitario - Ospedale Bufalini - Montefiore).

Il tuo obiettivo è analizzare l'intero codice sorgente fornito, individuare margini di miglioramento, ottimizzazioni di performance, nuove funzionalità ad alto impatto per gli utenti (studenti, pendolari, cittadini) e proporre codice pronto all'uso (drop-in replacement).
\`\`\`

---

## 📌 PANORAMICA DEL PROGETTO & ARCHITETTURA ATTUALE

1. **Stack Tecnologico**:
   - **Frontend**: HTML5, Tailwind CSS, Leaflet 1.9.4, Lucide/Heroicons SVG.
   - **Backend**: Node.js, Express 5, compatibile sia per esecuzione locale sia per **Vercel Serverless** (\`api/index.js\` + \`vercel.json\`).
   - **PWA & Mobile**: Meta tag Apple Mobile Web App per iOS Safari a tutto schermo, \`manifest.json\` con tema Start Romagna (\`#E30613\`), Service Worker.
   - **Transit Engine**:
     * Motore grafico a 60 FPS in \`requestAnimationFrame\`.
     * **GPS Libero 2D (Dead Reckoning)**: gli autobus si muovono liberamente su coordinate geografiche reali (\`lat\`, \`lon\`, \`bearing\`) senza forzature su polilinee rigide, ideale per gestire cantieri e deviazioni stradali a Cesena.
     * **Calcolo ETA geodetico intelligente**: formula di Haversine con fattore urbano 1.28x e velocità commerciale 6.1 m/s (22 km/h).
     * **Smart Commuting**: chip rapidi per pendolari (Campus ➔ FS, FS ➔ Campus), percorsi pedonali OSM, indicatore "Fai in tempo a piedi" e allarme acustico "Esci ora".
     * **Edge Caching**: header HTTP \`Cache-Control: public, s-maxage=10, stale-while-revalidate=20\` per Vercel Edge CDN.

2. **Repository GitHub Ufficiale**:
   - https://github.com/DenisAntolini/cesena-linea6-live

---

## 🎯 MISSIONI CONSIGLIATE DA ASSEGNARE A GEMINI

Puoi selezionare uno dei seguenti prompt in fondo alla richiesta per indirizzare Gemini su una specifica implementazione:

- **OPZIONE A - Web Push Notifications & Sveglia in Background**:
  *Implementa notifiche push vere tramite Service Worker e Push API (oppure Local Notification API) che avvisano l'utente anche a schermo spento quando mancano 3 minuti all'arrivo del bus alla sua fermata preferita.*

- **OPZIONE B - Dark Mode Automatica & Risparmio Batteria OLED**:
  *Aggiungi supporto completo a Tailwind Dark Mode (con selettore manuale o \`prefers-color-scheme\`), ottimizzando i consumi dello schermo OLED su smartphone e applicando tile scure Leaflet (CartoDB Dark Matter).*

- **OPZIONE C - Integrazione GTFS-RT Reale Start Romagna & Webhook**:
  *Collega o predisponi l'ingestione diretta del feed GTFS-RT (VehiclePositions / TripUpdates / Alerts di Start Romagna o Open Data Emilia-Romagna) con fallback dinamico su simulatore quando i bus non sono in servizio.*

- **OPZIONE D - Modalità Navigazione Pedonale Passo-Passo (Turn-by-Turn)**:
  *Aggiungi navigazione guidata per raggiungere a piedi la fermata da qualsiasi punto di Cesena con bussola giroscopica e indicazioni sui metri rimanenti.*

- **OPZIONE E - Ottimizzazione Offline PWA & Service Worker Avanzato**:
  *Rafforza \`public/sw.js\` con caching delle tile di Cesena e delle API per permettere all'app di avviarsi istantaneamente anche con connessione debole o assente.*

---

## 📂 STRUTTURA DEI FILE CHIAVE

\`\`\`
cesena-linea6-live/
├── api/
│   └── index.js             # Entrypoint Vercel Serverless
├── public/
│   ├── index.html           # Frontend SPA (Mappa Leaflet, Motore 60 FPS, UI Transit)
│   ├── manifest.json        # Configurazione PWA iOS/Android
│   ├── sw.js                # Service Worker
│   └── icon.svg             # Icona Start Romagna Linea 6
├── services/
│   └── liveTracker.js       # Simulatore, interpolazione 2D, calcolo arrivi e bearing
├── server.js                # Express Server (Locale + Serverless Vercel)
├── vercel.json              # Regole di rewrite Vercel Serverless
└── package.json             # Dipendenze Node.js
\`\`\`

---

## 💻 CODICE SORGENTE COMPLETO

### 1. \`vercel.json\`
\`\`\`json
${vercelJson.trim()}
\`\`\`

### 2. \`api/index.js\`
\`\`\`javascript
${apiIndex.trim()}
\`\`\`

### 3. \`server.js\`
\`\`\`javascript
${serverJs.trim()}
\`\`\`

### 4. \`public/manifest.json\`
\`\`\`json
${manifestJson.trim()}
\`\`\`

### 5. \`package.json\`
\`\`\`json
${packageJson.trim()}
\`\`\`

### 6. \`services/liveTracker.js\`
\`\`\`javascript
${liveTracker.trim()}
\`\`\`

### 7. \`public/index.html\`
\`\`\`html
${indexHtml.trim()}
\`\`\`

---
*Bundle generato per l'analisi e il potenziamento con Google Gemini.*
`;

fs.writeFileSync(path.join(__dirname, '..', 'GEMINI_PROMPT_BUNDLE.md'), bundle, 'utf8');
console.log('Creato GEMINI_PROMPT_BUNDLE.md con successo! Dimensione:', bundle.length, 'bytes');
