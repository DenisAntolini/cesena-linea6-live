# 🚌 Cesena Linea 6 Live

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/antol/cesena-linea6-live)
![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)
![Express](https://img.shields.io/badge/Express-5.x-lightgrey.svg)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen.svg)
![Vercel](https://img.shields.io/badge/Vercel-Serverless%20Ready-black.svg)
![PWA](https://img.shields.io/badge/PWA-Installable-purple.svg)

> **Web App in stile Google Maps Transit per il tracciamento in tempo reale degli autobus della Linea 6 di Cesena (Start Romagna)**:  
> *Rio Maggiore ⇄ Torre del Moro ⇄ Ippodromo ⇄ Stazione FS ⇄ Barriera Cavour ⇄ Ospedale Bufalini ⇄ Stadio Manuzzi ⇄ Montefiore*.

---

## 🌟 Funzionalità Principali

* **🗺️ Mappa Google Maps Transit Full-Screen (100vw × 100vh)**:
  * Interfaccia a schermo intero pulita, morbida e ad alto contrasto.
  * Mappa OpenStreetMap con filtro CSS dedicato a tema Google Maps Transit.
  * **Nessun cartellino fisso invasivo**: le fermate mostrano il nome solo al passaggio del mouse o al click.
* **🛣️ Tracciato Stradale Reale OSRM (Oltre 500 Coordinate GPS)**:
  * Gli autobus e il percorso non tagliano mai in linea retta sui palazzi, ma seguono fedelmente ogni curva, rotonda e ponte di Cesena (*Via Dismano, Via Gramsci, Viale Bovio, Stazione FS, Viale Carducci, Viale Mazzoni, Ponte Nuovo, Viale Ghirotti, Stadio Manuzzi*).
* **⚡ 3 Autobus Live Sempre in Movimento**:
  * 3 veicoli circolanti contemporaneamente (2 verso Montefiore e 1 verso Rio Maggiore) con orientamento di prua (bearing) calcolato in tempo reale lungo la strada.
* **🚦 "Riuscirò a prenderlo?" - Semaforo Intelligente per Passeggeri**:
  * Calcolo automatico dei tempi di cammino a piedi dalla tua posizione alla fermata.
  * Badge istantaneo:
    * 🟢 **Fai in tempo a piedi** (margine abbondante)
    * 🟡 **Esci subito** (autobus in arrivo a breve)
    * 🔴 **Troppo vicino, punta al successivo** (tempo a piedi insufficiente)
* **☁️ Pronto per Vercel Serverless & Edge CDN**:
  * Cache intelligente aggiornata a ogni richiesta senza dipendere da `setInterval`.
  * Header `Cache-Control` con `s-maxage` e `stale-while-revalidate` per sfruttare la CDN globale di Vercel.
* **📱 PWA Installabile**:
  * Supporto offline e installazione diretta su iPhone e smartphone Android con Service Worker `v3` e Web App Manifest.

---

## 📁 Struttura del Progetto

```text
cesena-linea6-live/
├── data/
│   └── linea6.json            # Polilinea stradale OSRM (569 punti) e fermate ufficiali
├── public/
│   ├── index.html             # UI Google Maps Transit & meta tag SEO
│   ├── style.css              # Stili responsive (desktop card + mobile bottom-sheet)
│   ├── app.js                 # Logica Leaflet, animazione 60fps e calcolo arrivi
│   ├── manifest.json          # PWA Manifest per installazione su smartphone
│   ├── sw.js                  # Service Worker per caching e PWA
│   ├── robots.txt             # Direttive per i motori di ricerca
│   ├── sitemap.xml            # Sitemap XML indicizzata
│   └── icon.svg               # Icona vettoriale Start Romagna Linea 6
├── scripts/
│   ├── fix-real-road-geometry.js # Script estrazione OSRM curva per curva
│   ├── extract-linea6.js      # Parser GTFS Start Romagna Bacino FC
│   └── sync-gtfs.js           # Downloader automatico open data GTFS
├── services/
│   └── liveTracker.js         # Motore di tracciamento GPS, interpolazione e arrivi
├── Dockerfile                 # Container Docker per deploy cloud (Cloud Run / Railway)
├── render.yaml                # Configurazione automatica Render.com
├── vercel.json                # Rewrites per Vercel Serverless
├── server.js                  # Server Express con esportazione serverless
└── package.json               # Dipendenze Node.js
```

---

## 🚀 Avvio Rapido in Locale

1. **Clona il repository**:
   ```bash
   git clone https://github.com/<TUO-UTENTE>/cesena-linea6-live.git
   cd cesena-linea6-live
   ```

2. **Installa le dipendenze**:
   ```bash
   npm install
   ```

3. **Avvia il server**:
   ```bash
   npm start
   ```

4. **Apri il browser**:
   Visita `http://localhost:3000`

---

## ☁️ Deploy su Vercel

Il progetto è configurato nativamente con `vercel.json` per funzionare come Serverless Function su Vercel.

### Metodo 1: Tramite Vercel CLI
```bash
npx vercel --prod
```

### Metodo 2: Tramite GitHub
1. Carica il repository su GitHub.
2. Vai su [vercel.com/new](https://vercel.com/new).
3. Importa il repository: Vercel rileverà automaticamente la configurazione e pubblicherà l'app in meno di 60 secondi.

---

## 📡 API Endpoints

| Metodo | Endpoint | Descrizione | Cache CDN |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/linea6/live` | Coordinate GPS e telemetria degli autobus attivi | `s-maxage=10` |
| `GET` | `/api/linea6/static` | Polilinea stradale OSRM e anagrafica fermate | `s-maxage=3600` |
| `GET` | `/api/linea6/arrivals?stop_id=...&direction=0` | Arrivi in tempo reale e semaforo catchability | Dinamico |
| `GET` | `/api/health` | Health check e diagnostica stato cache | `no-cache` |

---

## 📄 Licenza

Distribuito con licenza **MIT**. Dati delle linee e orari di proprietà di **Start Romagna S.p.A.** e **OpenStreetMap Contributors**.
