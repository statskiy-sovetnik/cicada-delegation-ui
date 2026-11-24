# syntax=docker/dockerfile:1

# UI: статика, собранная Vite и отданная nginx.
#
# Конфигурация в образ не пекётся — адрес Executor, ключ провайдера и делегатор
# приходят окружением при запуске и выкладываются в env.js (docker/entrypoint.sh).
# Поэтому образ один на все среды.

ARG NODE_VERSION=26-alpine
ARG NGINX_VERSION=1.29-alpine
ARG YARN_VERSION=1.22.22

# В образах node начиная с 25 нет ни yarn, ни corepack — ставим тот yarn,
# которым собран yarn.lock.
FROM node:${NODE_VERSION} AS build
ARG YARN_VERSION
RUN npm install --global yarn@${YARN_VERSION}
WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
# `tsc -b && vite build`: ошибка типов ломает сборку образа.
RUN yarn build

FROM nginx:${NGINX_VERSION} AS runtime

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --from=build /app/dist /usr/share/nginx/html

# nginx работает не от root, а env.js пишется при каждом запуске.
RUN chown -R nginx:nginx /usr/share/nginx/html

EXPOSE 8080
USER nginx

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
