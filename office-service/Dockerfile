FROM gotenberg/gotenberg:8.17.2

USER root

# Install Python 3, pip, curl
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Setup Python virtualenv
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py entrypoint.sh ./
RUN chmod +x entrypoint.sh && chown -R gotenberg:gotenberg /app

USER gotenberg

ENV PORT=8000
EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]

