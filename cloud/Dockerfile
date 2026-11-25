FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370

ENV NODE_ENV=production
WORKDIR /srv

COPY cloud/package.json cloud/package-lock.json cloud/
RUN cd cloud && npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY platform/package.json platform/
COPY platform/src platform/src
COPY sprints sprints
COPY cloud/src cloud/src
COPY cloud/migrations cloud/migrations

USER node
WORKDIR /srv/cloud
EXPOSE 8080
CMD ["node", "src/server.mjs"]
