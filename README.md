# Cicada Delegation — интерфейс делегатора

Браузерная половина стадии 1: читает каталог Executor, сверяет запись с текущей
позицией, собирает подпись делегации кошельком делегатора и показывает ход
исполнения.

Договорённости по организации кода — в `CLAUDE.md`, спецификация — в
`7702-demo/docs/ui-stage-1.md`.

## Раскладка

```
src/App.tsx             подключение кошелька и оболочка
src/Catalog.tsx         список записей, сверка, подпись
src/Execution.tsx       запуск и опрос статуса
src/caveats.ts          расшифровка кейвитов (общая, не позиционная)
src/positions/          всё, что специфично для позиции, за адаптером
src/adapters/executor/  API Executor, схемы zod
docker/                 nginx и подстановка конфигурации при запуске
```

## Запуск

```
cp .env.example .env     # заполнить
yarn install
yarn typecheck
yarn dev                 → http://localhost:5174
```

MetaMask подписать делегацию не даёт: внешние запросы подписи для внутренних
аккаунтов там запрещены. Подходит Zerion или другой кошелёк без этой проверки.

## Docker

```
docker compose build
docker compose up -d     → http://localhost:5174
```

Собранная статика отдаётся nginx от пользователя `nginx`, порт внутри
контейнера — 8080, снаружи `UI_PORT`.

Конфигурация в образ **не пекётся**: `ALCHEMY_API_KEY`, `DELEGATOR_ADDRESS`,
`EXECUTOR_URL` и `WALLETCONNECT_PROJECT_ID` приходят окружением при запуске,
`docker/entrypoint.sh` выкладывает их в `env.js`, а index.html грузит его до
бандла. Один образ годится для любой среды, и ключ провайдера не остаётся в
слоях образа.

`EXECUTOR_URL` — адрес, по которому Executor виден **из браузера**: запросы
делает страница, а не nginx.
