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

ssh "$host" "mkdir -p '$remote_dir'"

# O gate só precisa de usuário e senha no primeiro deploy, quando o .env da vps nasce. Exigir isso em
# todo deploy obrigaria a carregar a senha de produção na linha de comando sem motivo.
if ! ssh "$host" "test -f '$remote_dir/.env'"; then
	if [ -z "${KW_LAWYER_ACCESS_USER:-}" ] || [ -z "${KW_LAWYER_ACCESS_PASSWORD:-}" ]; then
		echo "A vps ainda não tem .env: defina KW_LAWYER_ACCESS_USER e KW_LAWYER_ACCESS_PASSWORD." >&2
		exit 1
	fi
fi

docker build --file deploy/Dockerfile.api --tag "$api_image" .
docker build --file deploy/Dockerfile.web --tag "$web_image" .

docker save "$api_image" "$web_image" | gzip | ssh "$host" "gunzip | docker load"

scp deploy/compose.yaml "$host:$remote_dir/compose.yaml"
scp deploy/kw-lawyer.caddy "$host:/home/ubuntu/lps/caddy/domains/kw-lawyer.caddy"

ssh "$host" \
	"REMOTE_DIR='$remote_dir' EDGE_NETWORK='$edge_network' CADDY_CONTAINER='$caddy_container' \
	 KW_LAWYER_API_IMAGE='$api_image' KW_LAWYER_WEB_IMAGE='$web_image' SITE_HOST='$site_host' \
	 ACCESS_USER='${KW_LAWYER_ACCESS_USER:-}' ACCESS_PASSWORD='${KW_LAWYER_ACCESS_PASSWORD:-}' bash -s" <<'REMOTE'
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

# Chave que falta é acrescentada sem reescrever o arquivo: o .env da vps guarda a senha do postgres e
# a chave que cifra os tokens do Google, e recriá-lo inutilizaria o que já está gravado no banco.
ensure_env() {
	grep -q "^$1=" .env || printf '%s=%s\n' "$1" "$2" >> .env
}

# As chaves VAPID nascem dentro da imagem, na vps: assim o par não passa pela minha máquina nem pela
# linha de comando do ssh. Sem elas a api sobe igual, só com os alertas desligados.
if ! grep -q '^VAPID_PUBLIC_KEY=' .env; then
	vapid="$(docker run --rm "$KW_LAWYER_API_IMAGE" bun -e \
		'import webpush from "web-push"; const keys = webpush.generateVAPIDKeys(); console.log(`${keys.publicKey} ${keys.privateKey}`)')"
	ensure_env VAPID_PUBLIC_KEY "${vapid%% *}"
	ensure_env VAPID_PRIVATE_KEY "${vapid##* }"
fi

ensure_env VAPID_SUBJECT "https://$SITE_HOST"
ensure_env WATCH_CLOCK on

KW_LAWYER_API_IMAGE="$KW_LAWYER_API_IMAGE" KW_LAWYER_WEB_IMAGE="$KW_LAWYER_WEB_IMAGE" \
	EDGE_NETWORK="$EDGE_NETWORK" docker compose --env-file .env up -d --wait

docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile
docker image prune -f
REMOTE

echo "Deploy concluido: https://$site_host"
