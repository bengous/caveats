# syntax=docker/dockerfile:1

FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.4.2-distroless@sha256:1a0c31c7c5f9d193aedf60fe1cebdeb76ac8f6e29f24be8dd8cbd6df72df26ec
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY src src
COPY ui ui
# The `nonroot` user of the distroless base.
USER 65532:65532
EXPOSE 4321
# Distroless has no shell and no curl: the image's own Bun probes the server.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/bun", "-e", "const response = await fetch('http://127.0.0.1:4321/healthz'); process.exit(response.ok ? 0 : 1);"]
ENTRYPOINT ["/usr/local/bin/bun", "src/cli.ts"]
CMD ["serve", "--host", "0.0.0.0", "--port", "4321"]
