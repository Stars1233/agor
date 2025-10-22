FROM mcr.microsoft.com/devcontainers/typescript-node:20 AS builder

# Install system dependencies for build
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm (use latest)
RUN npm install -g pnpm@latest

# Set working directory for build
WORKDIR /build

# Copy entire repository
COPY . .

# Install and build - verbose for debugging
# Note: We exclude agor-ui since this is a backend-focused playground
RUN echo "=== Starting pnpm install ===" && \
    pnpm install && \
    echo "=== Install complete, starting build ===" && \
    pnpm --filter '!agor-ui' -r build && \
    echo "=== Build complete ==="

# Production stage
FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm and AI CLIs in production stage (always get latest versions)
RUN npm install -g pnpm@latest @anthropic-ai/claude-code@latest @google/gemini-cli@latest @openai/codex@latest

# Copy built application from builder
WORKDIR /workspaces/agor
COPY --from=builder /build /workspaces/agor

# Run as root for simplified sandbox
