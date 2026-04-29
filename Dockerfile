# Production-oriented image: Node + Python (for AI scripts in container)
FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY ai/requirements.txt ./ai/requirements.txt
RUN python3 -m venv /opt/pyenv \
    && /opt/pyenv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/pyenv/bin/pip install --no-cache-dir -r ai/requirements.txt
ENV PATH="/opt/pyenv/bin:$PATH"

COPY . .

ENV NODE_ENV=production
ENV PORT=3040
ENV LOG_FILE=/app/backend_server.log

EXPOSE 3040

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const p=process.env.PORT||3040;require('http').get('http://127.0.0.1:'+p+'/health',(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>process.exit(r.statusCode===200&&d.trim()==='OK'?0:1));}).on('error',()=>process.exit(1))"

CMD ["node", "index.js"]
