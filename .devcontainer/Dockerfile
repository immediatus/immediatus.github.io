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
RUN chown -R developer:developer /workspaces

USER developer
ENV USER="developer"
ENV HOME="/home/developer"
ENV PATH="/home/developer/.local/bin:/usr/local/bin:${PATH}"
RUN mkdir -p /home/developer/.local/bin
