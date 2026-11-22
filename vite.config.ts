import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const VIRTUAL_ID = 'virtual:ui-env'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/**
 * Отдаёт значения из .env приложению через виртуальный модуль.
 *
 * Не define: в dev-режиме Vite 8 не подставляет define в исходники, и
 * приложение падает на `__ALCHEMY_API_KEY__ is not defined`, хотя сборка
 * проходит. Виртуальный модуль работает одинаково и в dev, и в build.
 *
 * Секретов среди этих значений нет: ключ провайдера и так уходит в браузер с
 * каждым RPC-запросом, приватных ключей интерфейс не держит вовсе.
 */
function uiEnv(values: Record<string, string>): Plugin {
  return {
    name: 'ui-env',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load(id) {
      if (id !== RESOLVED_ID) return null
      return Object.entries(values)
        .map(([key, value]) => `export const ${key} = ${JSON.stringify(value)}`)
        .join('\n')
    },
  }
}

export default defineConfig(({ mode }) => {
  // '' вместо префикса — грузим все переменные, а не только VITE_*
  const env = loadEnv(mode, process.cwd(), '')

  for (const name of ['ALCHEMY_API_KEY', 'DELEGATOR_ADDRESS']) {
    if (!env[name]?.trim()) {
      throw new Error(`${name} не задана в .env — скопируйте .env.example в .env и заполните`)
    }
  }

  return {
    plugins: [
      react(),
      uiEnv({
        ALCHEMY_API_KEY: env.ALCHEMY_API_KEY!.trim(),
        WALLETCONNECT_PROJECT_ID: env.WALLETCONNECT_PROJECT_ID?.trim() ?? '',
        DELEGATOR_ADDRESS: env.DELEGATOR_ADDRESS!.trim(),
        EXECUTOR_URL: env.EXECUTOR_URL?.trim() || 'http://localhost:8787',
      }),
    ],
    server: { port: 5174 },
  }
})
