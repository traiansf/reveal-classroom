# Image from an extracted deploy bundle (the bundle contains this file as deploy/docker/Dockerfile):
#   mkdir bundle && tar -xzf reveal-classroom.tar.gz -C bundle
#   docker build -t my-presentations -f bundle/deploy/docker/Dockerfile bundle
#   docker run -d --name presentations -p 127.0.0.1:3000:3000 -e PRESENTATION_PASSWORD=... my-presentations
# Publish the port on the loopback interface only and put an HTTPS reverse proxy in front.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY server.mjs ./
COPY dist ./dist
# The server refuses to listen on 0.0.0.0 without PRESENTATION_PASSWORD.
ENV HOST=0.0.0.0 PORT=3000 BASE_PATH= SESSION_TTL_HOURS=8
EXPOSE 3000
USER node
CMD ["node", "server.mjs"]
