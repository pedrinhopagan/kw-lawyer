#!/usr/bin/env bash

set -euo pipefail

host="${KW_LAWYER_VPS_HOST:-oracle-vps}"
remote_dir="${KW_LAWYER_REMOTE_DIR:-/home/ubuntu/kw-lawyer}"
edge_network="${KW_LAWYER_EDGE_NETWORK:-pagan-agency_default}"
caddy_container="${KW_LAWYER_CADDY_CONTAINER:-pagan-agency-caddy-1}"
site_host="${KW_LAWYER_SITE_HOST:-lawyer.paganagency.dedyn.io}"
tag="$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S)"
api_image="kw-lawyer-api:$tag"
web_image="kw-lawyer-web:$tag"

if [ -z "${KW_LAWYER_ACCESS_USER:-}" ] || [ -z "${KW_LAWYER_ACCESS_PASSWORD:-}" ]; then
	echo "Defina KW_LAWYER_ACCESS_USER e KW_LAWYER_ACCESS_PASSWORD antes do primeiro deploy." >&2
	exit 1
fi

docker build --file deploy/Dockerfile.api --tag "$api_image" .
docker build --file deploy/Dockerfile.web --tag "$web_image" .

docker save "$api_image" "$web_image" | gzip | ssh "$host" "gunzip | docker load"

ssh "$host" "mkdir -p '$remote_dir'"
scp deploy/compose.yaml "$host:$remote_dir/compose.yaml"
scp deploy/kw-lawyer.caddy "$host:/home/ubuntu/lps/caddy/domains/kw-lawyer.caddy"

ssh "$host" \
	"REMOTE_DIR='$remote_dir' EDGE_NETWORK='$edge_network' CADDY_CONTAINER='$caddy_container' \
	 KW_LAWYER_API_IMAGE='$api_image' KW_LAWYER_WEB_IMAGE='$web_image' SITE_HOST='$site_host' \
	 ACCESS_USER='$KW_LAWYER_ACCESS_USER' ACCESS_PASSWORD='$KW_LAWYER_ACCESS_PASSWORD' bash -s" <<'REMOTE'
set -euo pipefail

cd "$REMOTE_DIR"
docker network inspect "$EDGE_NETWORK" >/dev/null

if [ ! -f .env ]; then
	password="$(openssl rand -hex 32)"
	token_key="$(openssl rand -hex 32)"
	umask 077
	{
		printf 'NODE_ENV=production\n'
		printf 'PORT=1996\n'
		printf 'POSTGRES_DB=kw_lawyer\n'
		printf 'POSTGRES_USER=kw_lawyer\n'
		printf 'POSTGRES_PASSWORD=%s\n' "$password"
		printf 'DATABASE_URL=postgres://kw_lawyer:%s@kw-lawyer-postgres:5432/kw_lawyer\n' "$password"
		printf 'APP_BASE_URL=https://%s\n' "$SITE_HOST"
		printf 'TOKEN_ENCRYPTION_KEY=%s\n' "$token_key"
		printf 'ACCESS_USER=%s\n' "$ACCESS_USER"
		printf 'ACCESS_PASSWORD=%s\n' "$ACCESS_PASSWORD"
	} > .env
fi

KW_LAWYER_API_IMAGE="$KW_LAWYER_API_IMAGE" KW_LAWYER_WEB_IMAGE="$KW_LAWYER_WEB_IMAGE" \
	EDGE_NETWORK="$EDGE_NETWORK" docker compose --env-file .env up -d --wait

docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile
docker image prune -f
REMOTE

echo "Deploy concluido: https://$site_host"
