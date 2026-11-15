FROM mirror.gcr.io/library/node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

RUN apt-get update && apt-get install -y --no-install-recommends postgresql-15 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production MYCA_SANDBOX_HOSTED=1 PGDATA=/var/lib/myca-sandbox/pg
WORKDIR /srv

COPY cloud/package.json cloud/package-lock.json cloud/
RUN cd cloud && npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY platform/package.json platform/
COPY platform/src platform/src
COPY sprints sprints
COPY cloud/src cloud/src
COPY cloud/migrations cloud/migrations
COPY cloud/sandbox cloud/sandbox
COPY scripts/sandbox-server.mjs scripts/sandbox-server.mjs
COPY deploy/sandbox/start.sh /srv/start.sh

RUN mkdir -p /var/lib/myca-sandbox && chown postgres:postgres /var/lib/myca-sandbox && chmod 755 /srv/start.sh
EXPOSE 8080
CMD ["/srv/start.sh"]
