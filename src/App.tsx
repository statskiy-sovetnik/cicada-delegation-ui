import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatUnits, type Hex } from 'viem'
import { base } from 'wagmi/chains'
import { useAccount, useChainId, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'

import { BASESCAN_TX, DELEGATOR } from './config.ts'
import { GAUGE, GAUGE_ABI, METAROUTER } from './aerodrome.ts'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function App() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()

  const [confirming, setConfirming] = useState(false)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [error, setError] = useState<string | null>(null)

  const gauge = { address: GAUGE, abi: GAUGE_ABI } as const
  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      { ...gauge, functionName: 'balanceOf', args: [DELEGATOR] },
      { ...gauge, functionName: 'allowance', args: [DELEGATOR, METAROUTER] },
      { ...gauge, functionName: 'isApprovedForAll', args: [DELEGATOR, METAROUTER] },
    ],
    query: { refetchOnWindowFocus: false },
  })

  const staked = data?.[0].status === 'success' ? data[0].result : undefined
  const allowance = data?.[1].status === 'success' ? data[1].result : undefined
  const blanket = data?.[2].status === 'success' ? data[2].result : undefined

  const { writeContractAsync, isPending } = useWriteContract()
  const { isLoading: mining } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
    query: { enabled: txHash !== null },
  })

  const wrongAccount = isConnected && address?.toLowerCase() !== DELEGATOR.toLowerCase()
  const wrongChain = isConnected && chainId !== base.id
  // Выдавать апрув может только сам делегатор: он меняет состояние его
  // аккаунта на гейдже, с чужого адреса просто не сработает.
  const canApprove = isConnected && !wrongAccount && !wrongChain

  const enough =
    staked !== undefined && allowance !== undefined
      ? blanket === true || allowance >= staked
      : undefined

  async function onApprove() {
    if (staked === undefined) return
    setError(null)
    setConfirming(false)
    try {
      const hash = await writeContractAsync({
        ...gauge,
        functionName: 'approve',
        args: [METAROUTER, staked],
      })
      setTxHash(hash)
    } catch (e) {
      setError(message(e))
    }
  }

  return (
    <main>
      <header>
        <h1>Cicada Delegation</h1>
        <ConnectButton />
      </header>

      {isConnected && wrongAccount && (
        <p className="warn">
          Подключён {short(address!)} — ожидается делегатор {short(DELEGATOR)}. Переключите аккаунт
          в кошельке.
        </p>
      )}
      {isConnected && wrongChain && <p className="warn">Нужна сеть Base.</p>}

      <section className="card">
        <h2>Позиция Aerodrome WETH/VVV</h2>
        {isLoading || staked === undefined ? (
          <p className="muted">загрузка…</p>
        ) : (
          <ul className="checks">
            <li>
              застейкано в гейдже <em>{formatUnits(staked, 18)} LP</em>
            </li>
            <li className={enough ? 'ok' : 'fail'}>
              <span>{enough ? '✓' : '✗'}</span> апрув Metarouter
              {allowance !== undefined && <em> — allowance {formatUnits(allowance, 18)} LP</em>}
              {blanket === true && <em> · бессрочный, setApprovalForAll</em>}
            </li>
          </ul>
        )}

        <p className="muted">
          Без апрува запись каталога не исполнится: роутер снимает стейк за владельца.
          Выдаётся ровно на размер позиции и списывается при выходе.
        </p>

        {!confirming ? (
          <div className="row">
            <button onClick={() => setConfirming(true)} disabled={!canApprove || staked === undefined || enough === true}>
              {enough === true ? 'Апрув уже выдан' : 'Approve Metarouter'}
            </button>
            <button className="link" onClick={() => void refetch()}>
              обновить
            </button>
          </div>
        ) : (
          <div className="card">
            <p className="warn">
              Metarouter получит право снять {staked !== undefined && formatUnits(staked, 18)} LP с
              вашего стейка. Право списывается при первом выходе. Продолжить?
            </p>
            <div className="row">
              <button onClick={() => void onApprove()} disabled={isPending}>
                {isPending ? 'Подтвердите в кошельке…' : 'Да, выдать апрув'}
              </button>
              <button className="link" onClick={() => setConfirming(false)}>
                отмена
              </button>
            </div>
          </div>
        )}

        {txHash && (
          <p className="mono">
            <a href={BASESCAN_TX(txHash)} target="_blank" rel="noreferrer">
              {short(txHash)}
            </a>{' '}
            {mining ? '· ждём подтверждения' : '· подтверждено'}
          </p>
        )}

        {error && <p className="bad">{error}</p>}
      </section>
    </main>
  )
}

function message(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; name?: string }
  if (err?.name === 'UserRejectedRequestError') return 'отклонено в кошельке'
  return err?.shortMessage ?? err?.message ?? String(e)
}
