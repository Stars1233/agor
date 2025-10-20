FROM mcr.microsoft.com/devcontainers/typescript-node:20

# Install system dependencies (matches Dockerfile.dev)
RUN apt-get update && apt-get install -y \
    sqlite3 \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm and AI coding agent CLIs (matches Dockerfile.dev)
RUN npm install -g pnpm@9.15.1 @anthropic-ai/claude-code @google/gemini-cli

# Set working directory
WORKDIR /workspace

# Switch to non-root user (required for Codespaces)
USER node
