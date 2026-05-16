#!/bin/sh

export BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
export NGINX_LISTEN_PORT="${NGINX_LISTEN_PORT:-80}"

envsubst '${BACKEND_URL} ${NGINX_LISTEN_PORT}' \
    < /etc/nginx/conf.d/default.conf.template \
    > /etc/nginx/conf.d/default.conf

exec "$@"
