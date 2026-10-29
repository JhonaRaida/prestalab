# Una sola imagen para el Gateway y los 5 servicios; cada contenedor arranca su propio proceso (ver docker-compose.yml)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY shared ./shared
COPY gateway ./gateway
COPY services ./services
COPY db ./db
COPY docs ./docs
USER node
EXPOSE 8080
CMD ["node", "gateway/src/index.js"]
