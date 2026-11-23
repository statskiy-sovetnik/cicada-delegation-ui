import { useEffect, useState } from 'react'

import { ExecutorError, fetchExecution } from './adapters/executor/index.ts'
import type { Execution as ExecutionBody, ExecutionStatus } from './adapters/executor/index.ts'
import { BASESCAN_TX } from './config.ts'

/** Нетерминальный статус один — `pending` (5.4). Остальные опрашивать незачем. */
const isFinal = (status: ExecutionStatus) => status !== 'pending'

/** Исходы, означающие успех. Всё прочее — отказ той или иной стадии. */
const GOOD: ExecutionStatus[] = ['onchain_executed', 'simulation_success', 'estimate_gas_success']

const POLL_MS = 3000

const classOf = (status: ExecutionStatus) =>
  GOOD.includes(status) ? 'good' : status === 'pending' ? 'muted' : 'bad'

/**
 * Ход исполнения: опрос `GET /execution/{id}` до терминального статуса (5.4).
 *
 * Вебхуков нет по спецификации, исход доставляется опросом. Опрос
 * останавливается, как только статус стал терминальным, и при размонтировании.
 */
export function ExecutionProgress({ executionId }: { executionId: string }) {
  const [body, setBody] = useState<ExecutionBody | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const tick = async () => {
      try {
        const next = await fetchExecution(executionId)
        if (stopped) return
        setBody(next)
        setError(null)
        if (!isFinal(next.status)) timer = setTimeout(() => void tick(), POLL_MS)
      } catch (e) {
        if (stopped) return
        setError(e instanceof ExecutorError ? e.message : String(e))
        timer = setTimeout(() => void tick(), POLL_MS)
      }
    }

    void tick()
    return () => {
      stopped = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [executionId])

  if (error && !body) return <p className="bad">не удалось получить статус: {error}</p>
  if (!body) return <p className="muted">запрашиваем статус…</p>

  const waiting = !isFinal(body.status)

  return (
    <div className="card">
      <p className={classOf(body.status)}>
        {waiting && <span className="spinner" />}
        {body.status}
        {waiting && ' — ждём включения в блок'}
      </p>

      {body.statusDetail && <p className="muted">{body.statusDetail}</p>}

      <dl className="summary">
        <div>
          <dt>исполнение</dt>
          <dd className="mono">{body.executionId}</dd>
        </div>
        {body.txHash && (
          <div>
            <dt>транзакция</dt>
            <dd className="mono">
              <a href={BASESCAN_TX(body.txHash)} target="_blank" rel="noreferrer">
                {body.txHash}
              </a>
            </dd>
          </div>
        )}
        {body.blockNumber !== null && (
          <div>
            <dt>блок</dt>
            <dd className="mono">{body.blockNumber}</dd>
          </div>
        )}
        {body.gasUsed !== null && (
          <div>
            <dt>газ</dt>
            <dd className="mono">{body.gasUsed}</dd>
          </div>
        )}
        {body.operator && (
          <div>
            <dt>оператор</dt>
            <dd className="mono">{body.operator}</dd>
          </div>
        )}
      </dl>

      {error && <p className="muted">опрос сбоит: {error}</p>}
    </div>
  )
}
