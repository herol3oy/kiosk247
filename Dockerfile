# syntax=docker/dockerfile:1

FROM python:3.14.2-slim-trixie

WORKDIR /code

RUN pip install --no-cache-dir shot-scraper cloudinary && \
    shot-scraper install && \
    playwright install-deps && \
    rm -rf /var/lib/apt/lists/*

COPY main.py cleanup.py .

CMD ["python", "-u", "main.py"]
