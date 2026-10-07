FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /srv

COPY cloud/package.json cloud/package-lock.json cloud/
RUN cd cloud && npm ci --omit=dev && npm cache clean --force

COPY platform/package.json platform/
COPY platform/src platform/src
COPY sprints sprints
COPY cloud/src cloud/src
COPY cloud/migrations cloud/migrations

USER node
WORKDIR /srv/cloud
EXPOSE 8080
CMD ["node", "src/server.mjs"]
