import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const VIRTUAL_ID = 'virtual:ui-env'
const RESOLVED_ID = '\0' + VIRTUAL_ID

/** Без этих значений интерфейс не работает вовсе. */
const REQUIRED = ['ALCHEMY_API_KEY', 'DELEGATOR_ADDRESS'] as const

/** Остальные — с запасным значением. */
const OPTIONAL: Record<string, string> = {
  WALLETCONNECT_PROJECT_ID: '',
  EXECUTOR_URL: 'http://localhost:8787',
}

const NAMES = [...REQUIRED, ...Object.keys(OPTIONAL)]

/**
 * Значения приходят приложению через виртуальный модуль, а не через define: в
 * dev-режиме Vite 8 не подставляет define в исходники, и приложение падает на
 * `__ALCHEMY_API_KEY__ is not defined`, хотя сборка проходит.
 *
 * Источник у модуля разный. В разработке значения вшиваются из .env. В сборке
 * — читаются при запуске из `window.__UI_ENV__`, который выкладывает контейнер
 * (docker/entrypoint.sh), а index.html грузит до бандла. Так один образ годится
 * для любой среды: пересобирать под каждую не нужно.
 *
 * Секретов среди этих значений нет: ключ провайдера и так уходит в браузер с
 * каждым RPC-запросом, приватных ключей интерфейс не держит вовсе.
 */
function baked(env: Record<string, string>): string {
  return NAMES.map((name) => {
    const value = env[name]?.trim() || OPTIONAL[name] || ''
    return `export const ${name} = ${JSON.stringify(value)}`
  }).join('\n')
}

function runtime(): string {
  return [
    'const env = globalThis.__UI_ENV__ ?? {}',
    'const read = (name) => (typeof env[name] === "string" ? env[name].trim() : "")',
    'function required(name) {',
    '  const value = read(name)',
    '  if (!value) throw new Error(`${name} не подставлена в env.js`)',
    '  return value',
    '}',
    ...REQUIRED.map((name) => `export const ${name} = required(${JSON.stringify(name)})`),
    ...Object.entries(OPTIONAL).map(
      ([name, fallback]) =>
        `export const ${name} = read(${JSON.stringify(name)}) || ${JSON.stringify(fallback)}`,
    ),
  ].join('\n')
}

function uiEnv(source: () => string): Plugin {
  return {
    name: 'ui-env',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load: (id) => (id === RESOLVED_ID ? source() : null),
  }
}

export default defineConfig(({ command, mode }) => {
  // '' вместо префикса — грузим все переменные, а не только VITE_*
  const env = loadEnv(mode, process.cwd(), '')

  // Сборка о значениях не знает: их подставит контейнер при запуске. Проверять
  // .env имеет смысл только в режиме разработки.
  if (command === 'serve') {
    for (const name of REQUIRED) {
      if (!env[name]?.trim()) {
        throw new Error(`${name} не задана в .env — скопируйте .env.example в .env и заполните`)
      }
    }
  }

  return {
    plugins: [react(), uiEnv(command === 'serve' ? () => baked(env) : runtime)],
    server: { port: 5174 },
  }
})
