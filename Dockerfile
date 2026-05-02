# Production-ready image for the FastAPI backend.
# Single-stage Python image; layer-cached for fast rebuilds.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps (minimal). Add build-essential only if a wheel needs compiling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for cache efficiency
COPY pyproject.toml ./
RUN pip install --upgrade pip && \
    pip install \
        "pydantic[email]>=2.6" "httpx>=0.27" "python-dotenv>=1.0" \
        "rich>=13.7" "pandas>=2.2" "numpy>=1.26" \
        "langgraph>=0.2" "langchain-core>=0.3" "tenacity>=8.2" \
        "fastapi>=0.110" "uvicorn[standard]>=0.29" \
        "PyJWT>=2.8" "sentry-sdk>=2.0" \
        "openai>=1.30" "anthropic>=0.30"

# Copy app
COPY src/ ./src/
COPY api/ ./api/

ENV PYTHONPATH=/app/src \
    TA_DATA_DIR=/app/.tradingagents \
    TA_MODE=mock

# Railway / Fly inject $PORT; default to 8000 locally.
ENV PORT=8000
EXPOSE 8000

# Health check (Railway uses this)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
    CMD curl -fsS "http://localhost:${PORT}/v1/health" || exit 1

# Single worker by default; bump to >1 once you move memory/cache off-process.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
