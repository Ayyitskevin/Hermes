# Hermes — single-operator self-host (C5 polish). Not a multi-user SaaS image.
FROM python:3.12-slim
WORKDIR /app
RUN useradd --system --home /app --shell /usr/sbin/nologin hermes
COPY pyproject.toml README.md LICENSE ./
COPY src ./src
COPY web ./web
COPY config ./config
COPY deploy ./deploy
RUN pip install --no-cache-dir -e . && mkdir -p /app/data /app/logs && chown -R hermes:hermes /app
USER hermes
ENV HERMES_DATA_DIR=/app/data HERMES_LOG_DIR=/app/logs
EXPOSE 8642
CMD ["hermes", "serve"]
