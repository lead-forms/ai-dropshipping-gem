FROM apify/actor-node:24
USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev --omit=optional
COPY . ./
USER myuser
CMD ["npm", "start"]
