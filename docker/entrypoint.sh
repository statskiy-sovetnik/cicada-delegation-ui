#!/bin/sh
# Выкладывает конфигурацию среды в env.js и передаёт управление nginx.
#
# Образ один на все среды: адрес Executor, ключ провайдера и делегатор приходят
# окружением при запуске, а не пекутся в сборку. index.html грузит env.js до
# бандла (см. vite.config.ts).
set -eu

html=/usr/share/nginx/html
target="$html/env.js"

for name in ALCHEMY_API_KEY DELEGATOR_ADDRESS; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "entrypoint: переменная окружения $name не задана" >&2
    exit 1
  fi
done

# Экранирование: значения приходят снаружи и попадают в исходник JavaScript.
escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g'
}

cat > "$target" <<EOF
// Создан entrypoint.sh при запуске контейнера. Правки не переживут перезапуск.
window.__UI_ENV__ = {
  ALCHEMY_API_KEY: "$(escape "${ALCHEMY_API_KEY}")",
  WALLETCONNECT_PROJECT_ID: "$(escape "${WALLETCONNECT_PROJECT_ID:-}")",
  DELEGATOR_ADDRESS: "$(escape "${DELEGATOR_ADDRESS}")",
  EXECUTOR_URL: "$(escape "${EXECUTOR_URL:-http://localhost:8787}")"
}
EOF

echo "entrypoint: env.js собран, делегатор ${DELEGATOR_ADDRESS}, Executor ${EXECUTOR_URL:-http://localhost:8787}"

exec "$@"
