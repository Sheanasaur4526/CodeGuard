FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m runner
WORKDIR /app
COPY server.js .
USER runner
ENV PORT=2000
EXPOSE 2000
CMD ["node", "server.js"]
