FROM registry.fedoraproject.org/fedora:43 AS zola-fetcher
RUN dnf install -y curl tar && dnf clean all
RUN curl -L "https://github.com/getzola/zola/releases/download/v0.22.1/zola-v0.22.1-x86_64-unknown-linux-gnu.tar.gz" -o zola.tar.gz \
    && tar -xzf zola.tar.gz \
    && mv zola /usr/local/bin/zola \
    && chmod +x /usr/local/bin/zola
FROM docker.io/oven/bun:latest AS bun-source
FROM registry.fedoraproject.org/fedora:43
WORKDIR /workspaces
RUN dnf install -y nodejs npm git unzip shadow-utils python3 tzdata && dnf clean all
RUN useradd -m -u 1000 -s /bin/bash developer
COPY --from=zola-fetcher /usr/local/bin/zola /usr/local/bin/zola
COPY --from=bun-source /usr/local/bin/bun /usr/local/bin/bun
RUN ln -sf /usr/local/bin/bun /usr/local/bin/bunx

# Install Claude Code globally inside container
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force

# Create xclaude and xagy wrapper scripts
RUN printf '#!/usr/bin/env bash\nexec claude --channels plugin:telegram@claude-plugins-official --dangerously-skip-permissions --allow-dangerously-skip-permissions --remote-control "$(basename "$PWD")" "$@"\n' > /usr/local/bin/xclaude \
    && chmod +x /usr/local/bin/xclaude
RUN printf '#!/usr/bin/env bash\nexec agy --dangerously-skip-permissions "$@"\n' > /usr/local/bin/xagy \
    && chmod +x /usr/local/bin/xagy

RUN chown -R developer:developer /workspaces

USER developer
ENV USER="developer"
ENV HOME="/home/developer"
ENV PATH="/home/developer/.local/bin:/usr/local/bin:${PATH}"
RUN mkdir -p /home/developer/.local/bin
