# Deployment Guide

All compose files live alongside the app code in `apps/unihub/`. Both use `name: unihub` so containers are always named `unihub-backend-1`, `unihub-db-1`, etc. Run every command from the **repo root** unless noted otherwise.

---

## Local development (build from source)

Builds all three services from local source on every `up`. No secrets file needed — credentials are hardcoded for local use only.

```bash
docker compose -f apps/unihub/docker-compose.local.yml up -d
```

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:3000     |
| Backend  | http://localhost:8000     |
| Postgres | localhost:5432            |

Stop and remove containers (data volume is preserved):

```bash
docker compose -f apps/unihub/docker-compose.local.yml down
```

Wipe the database volume too:

```bash
docker compose -f apps/unihub/docker-compose.local.yml down -v
```

---

## Production (pre-built images)

### 1. Build images

```bash
docker build -t unihub-backend:latest apps/unihub/backend
docker build -t unihub-frontend:latest apps/unihub/frontend
```

Tag with a version for rollbacks:

```bash
docker build -t unihub-backend:$(git rev-parse --short HEAD) apps/unihub/backend
docker build -t unihub-frontend:$(git rev-parse --short HEAD) apps/unihub/frontend
```

### 2. Create the secrets file

```bash
cp .env.example apps/unihub/.env
```

Fill in every `change-me` value:

| Variable | Description |
|---|---|
| `POSTGRES_USER` | Database username |
| `POSTGRES_PASSWORD` | Database password — use a strong random value |
| `DJANGO_SECRET_KEY` | Django secret key — generate with `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hostnames Django will serve (e.g. `unihub.example.com`) |
| `CORS_ALLOWED_ORIGINS` | Full origin(s) the frontend is served from (e.g. `https://unihub.example.com`) |
| `CSRF_TRUSTED_ORIGINS` | Same as CORS origins |
| `BACKEND_IMAGE` | Image tag built in step 1 (e.g. `unihub-backend:abc1234`) |
| `FRONTEND_IMAGE` | Image tag built in step 1 (e.g. `unihub-frontend:abc1234`) |
| `FRONTEND_PORT` | Host port to expose the frontend on (default `80`) |

### 3. Deploy

```bash
docker compose -f apps/unihub/docker-compose.production.yml --env-file apps/unihub/.env up -d
```

### 4. Run migrations

Only needed on first deploy or after adding new domain apps:

```bash
docker compose -f apps/unihub/docker-compose.production.yml exec backend python manage.py migrate
```

### 5. Create a superuser (first deploy only)

```bash
docker compose -f apps/unihub/docker-compose.production.yml exec backend python manage.py createsuperuser
```

---

## Updating production

```bash
# 1. Build new images
docker build -t unihub-backend:$(git rev-parse --short HEAD) apps/unihub/backend
docker build -t unihub-frontend:$(git rev-parse --short HEAD) apps/unihub/frontend

# 2. Update image tags in apps/unihub/.env
#    BACKEND_IMAGE=unihub-backend:<new-sha>
#    FRONTEND_IMAGE=unihub-frontend:<new-sha>

# 3. Pull up with new images
docker compose -f apps/unihub/docker-compose.production.yml --env-file apps/unihub/.env up -d

# 4. Run any new migrations
docker compose -f apps/unihub/docker-compose.production.yml exec backend python manage.py migrate
```

---

## Logs

```bash
# All services
docker compose -f apps/unihub/docker-compose.production.yml logs -f

# Single service
docker compose -f apps/unihub/docker-compose.production.yml logs -f backend
```

## Health check

```bash
curl http://localhost:8000/api/health/
# → {"status": "ok"}
```
