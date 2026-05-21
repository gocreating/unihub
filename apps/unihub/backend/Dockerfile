FROM python:3.12-slim

RUN echo 'Acquire::Retries "5";' > /etc/apt/apt.conf.d/80-retries \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
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
COPY data_io/ ./data_io/
COPY manage.py ./

RUN UV_HTTP_TIMEOUT=120 uv sync --no-dev --no-editable

# collectstatic does not connect to the DB
RUN DJANGO_SECRET_KEY=collectstatic uv run python manage.py collectstatic --noinput

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

ENV PYTHONPATH=/app
ENV DJANGO_SETTINGS_MODULE=unihub.settings

EXPOSE 8000

ENTRYPOINT ["uv", "run", "./entrypoint.sh"]
