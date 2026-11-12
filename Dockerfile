# Immagine leggera Node.js Alpine
FROM node:20-alpine

# Imposta la directory di lavoro nel container
WORKDIR /app

# Copia i file di dipendenze
COPY package*.json ./

# Installa solo le dipendenze di produzione
RUN npm ci --only=production

# Copia l'intero codice sorgente
COPY . .

# Esponi la porta 3000
EXPOSE 3000

# Variabili di ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Comando di avvio del server
CMD ["node", "server.js"]
