FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

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
