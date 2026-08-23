# syntax=docker/dockerfile:1
# Optional self-contained image for local use or independent hosting.
# CI deploys the generated static files over SCP and does not build this image.

FROM ghcr.io/gohugoio/hugo:v0.164.0@sha256:f8671f2299e60154536c158bff8ce27f6eef4dddbbfc73bcce66263276ae0f80 AS build

ARG SITE_VERSION=""
WORKDIR /project
COPY --chown=hugo:hugo . .
RUN if [ -n "$SITE_VERSION" ]; then export HUGO_PARAMS_VERSION="$SITE_VERSION"; fi; \
    hugo --destination /project/public

FROM nginx:1.30.4-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46

LABEL org.opencontainers.image.source="https://github.com/cmilanf/themindcamp-gaiden"
LABEL org.opencontainers.image.description="The MindCamp Gaiden — web-consola"

# The site needs no backend or custom endpoint, but does get a hardened
# server block (security headers) in place of the image's default config.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /project/public /usr/share/nginx/html
