FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev --omit=optional
COPY . ./
RUN chown -R node:node /usr/src/app
USER node
CMD ["npm", "start"]
