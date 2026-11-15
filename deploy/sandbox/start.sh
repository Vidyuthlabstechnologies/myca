#!/bin/sh
set -eu
bin=/usr/lib/postgresql/15/bin
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  su postgres -s /bin/sh -c "$bin/initdb -D '$PGDATA' -U myca --auth=trust >/dev/null"
fi
su postgres -s /bin/sh -c "$bin/pg_ctl -D '$PGDATA' -o \"-c listen_addresses=127.0.0.1 -c port=5439 -c unix_socket_directories=/tmp\" -w start >/dev/null"
export MYCA_DATABASE_URL="postgres://myca@127.0.0.1:5439/myca_sandbox"
exec su node -s /bin/sh -c "cd /srv && exec node scripts/sandbox-server.mjs --host=0.0.0.0 --port=${PORT:-8080} --public-url=\"\$MYCA_SANDBOX_PUBLIC_URL\" ${MYCA_SANDBOX_ARGS:-}"
