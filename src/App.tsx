import { ConnectButton } from '@rainbow-me/rainbowkit'
import { base } from 'wagmi/chains'
import { useAccount, useChainId } from 'wagmi'

import { DELEGATOR } from './config.ts'
import { Catalog } from './Catalog.tsx'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * Интерфейс каталога, стадия 1: просмотр записей, сверка с позицией и сбор
 * подписей. Про конкретные позиции здесь не знают — всё специфичное живёт в
 * src/positions за адаптером.
 */
export function App() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  const wrongAccount = isConnected && address?.toLowerCase() !== DELEGATOR.toLowerCase()
  const wrongChain = isConnected && chainId !== base.id

  /**
   * Почему действия недоступны — текстом, а не флагом.
   *
   * Всё, что меняет состояние, делает делегатор: подпись — его ключом, апрув —
   * его аккаунтом. Но мёртвая кнопка без причины рядом ничего не объясняет:
   * предупреждение висит вверху страницы, а кнопка — внутри свёрнутой карточки.
   */
  const blocked: string | null = !isConnected
    ? `кошелёк не подключён — нужен делегатор ${short(DELEGATOR)}`
    : wrongAccount
      ? `подключён ${short(address!)}, а нужен делегатор ${short(DELEGATOR)}`
      : wrongChain
        ? 'кошелёк не в сети Base'
        : null

  return (
    <main>
      <header>
        <h1>Cicada Delegation</h1>
        <ConnectButton />
      </header>

      {!isConnected && (
        <p className="muted">
          Подключите кошелёк делегатора {short(DELEGATOR)}, чтобы подписывать записи.
        </p>
      )}
      {isConnected && wrongAccount && (
        <p className="warn">
          Подключён {short(address!)} — ожидается делегатор {short(DELEGATOR)}. Переключите аккаунт
          в кошельке.
        </p>
      )}
      {isConnected && wrongChain && <p className="warn">Нужна сеть Base.</p>}

      <Catalog blocked={blocked} />
    </main>
  )
}
