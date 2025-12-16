# syntax=docker/dockerfile:1

FROM python:3.14.2-slim-trixie

WORKDIR /code

COPY requirements.txt .

RUN apt-get update && apt-get install -y build-essential && \
    pip install --no-cache-dir -r requirements.txt && \
    shot-scraper install && \
    playwright install-deps && \
    rm -rf /var/lib/apt/lists/*

COPY main.py cleanup.py .

CMD ["python", "-u", "main.py"]
