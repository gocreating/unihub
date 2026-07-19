FROM python:3.12-slim

RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.6 /uv /uvx /bin/

COPY pyproject.toml ./
COPY unihub/ ./unihub/
COPY health/ ./health/
COPY core/ ./core/
COPY finance/ ./finance/
COPY visiting/ ./visiting/
COPY language/ ./language/
COPY people/ ./people/
COPY music/ ./music/
COPY inventory/ ./inventory/
COPY data_io/ ./data_io/
COPY sync/ ./sync/
COPY system/ ./system/
COPY manage.py ./

RUN UV_HTTP_TIMEOUT=300 uv sync --no-dev --no-editable

# collectstatic does not connect to the DB. --no-sync: use the environment
# built by `uv sync --no-dev` above — a plain `uv run` re-syncs WITH dev
# dependencies (ruff) and needs the network mid-build.
RUN DJANGO_SECRET_KEY=collectstatic uv run --no-sync python manage.py collectstatic --noinput

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV PYTHONPATH=/app
ENV DJANGO_SETTINGS_MODULE=unihub.settings

EXPOSE 8000

ENTRYPOINT ["uv", "run", "--no-sync", "./entrypoint.sh"]
