FROM registry.fedoraproject.org/fedora:45 AS zola-fetcher
RUN dnf install -y curl tar && dnf clean all
RUN curl -L "https://github.com/getzola/zola/releases/download/v0.22.1/zola-v0.22.1-x86_64-unknown-linux-gnu.tar.gz" -o zola.tar.gz \
    && tar -xzf zola.tar.gz \
    && mv zola /usr/local/bin/zola \
    && chmod +x /usr/local/bin/zola
FROM docker.io/oven/bun:latest AS bun-source
FROM registry.fedoraproject.org/fedora:45
WORKDIR /workspaces
RUN dnf install -y nodejs nodejs-npm git unzip shadow-utils python3 tzdata && dnf clean all

# Toolchains for the experiments repository's optional checks: pip for its pinned lint tools
# (experiments/requirements-dev.txt), Java for TLC (the TLA+ specifications), the .NET SDK for P.
RUN dnf install -y python3-pip java-25-openjdk-headless dotnet-sdk-10.0 && dnf clean all

# TLC: tla2tools.jar of the release the specifications were checked with, pinned by checksum.
RUN mkdir -p /opt/tla \
    && curl -fsSL "https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar" -o /opt/tla/tla2tools.jar \
    && echo "e1f11b75c4b5bc4478ba0ac5cb6ae28e40a01b0016bc33e0aa97da22dfdbcd7f  /opt/tla/tla2tools.jar" | sha256sum -c -
ENV TLA2TOOLS="/opt/tla/tla2tools.jar"
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

RUN chown -R developer:developer /workspaces /usr/local/lib/node_modules /usr/local/bin

USER developer
ENV USER="developer"
ENV HOME="/home/developer"
ENV NPM_CONFIG_PREFIX="/home/developer/.npm-global"
ENV PATH="/home/developer/.npm-global/bin:/home/developer/.local/bin:/home/developer/.dotnet/tools:/usr/local/bin:${PATH}"
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1
# P 3.1.0 targets .NET 8, which Fedora 45 no longer ships; let it run on the newer runtime.
ENV DOTNET_ROLL_FORWARD=Major
RUN mkdir -p /home/developer/.local/bin /home/developer/.npm-global

# P, the version the experiments' models were checked with.
RUN dotnet tool install --global P --version 3.1.0
