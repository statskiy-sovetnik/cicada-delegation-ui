import { useCallback, useEffect, useState } from 'react'
import type { Abi, Hex } from 'viem'
import { useConfig, usePublicClient, useSignTypedData, useWriteContract } from 'wagmi'

import {
  attachSignatures,
  ExecutorError,
  fetchAction,
  fetchActionRaw,
  listActions,
  postExecute,
} from './adapters/executor/index.ts'
import type { ActionSummary, DecodedAction, RawAction } from './adapters/executor/index.ts'
import { describeCaveats } from './caveats.ts'
import { typedDataFor } from './delegation.ts'
import { ExecutionProgress } from './Execution.tsx'
import { Copy, Hint } from './Hint.tsx'
import { BASESCAN_TX } from './config.ts'
import { adapterFor } from './positions/index.ts'
import type { CaveatView, PositionReport, Remedy } from './types/index.ts'

const short = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`

/** Пометка записи. Приговор по позиции и состояние записи — разные вещи (5.2 ui-stage-1). */
type Mark = 'spent' | 'critical' | 'unsigned' | 'warning' | 'ok'

const MARK_LABEL: Record<Mark, string> = {
  spent: 'исполнено',
  critical: 'critical',
  unsigned: 'требует подписи',
  warning: 'warning',
  ok: 'активен',
}

/** Цвет пометки. «Требует подписи» — оранжевый, как предупреждение. */
const MARK_CLASS: Record<Mark, string> = {
  spent: 'muted',
  critical: 'bad',
  unsigned: 'warn-text',
  warning: 'warn-text',
  ok: 'good',
}

/**
 * Израсходованная запись перебивает всё остальное: подписывать и исполнять уже
 * нечего, а сверка с позицией для неё бессмысленна — `LimitedCalls` исчерпан, и
 * повторно она неисполнима ни через Executor, ни ончейн (5.7).
 */
function markFor(summary: ActionSummary, report: PositionReport | null): Mark {
  if (summary.spent) return 'spent'
  if (report?.verdict === 'critical') return 'critical'
  if (summary.status === 'draft') return 'unsigned'
  if (report?.verdict === 'warning') return 'warning'
  return 'ok'
}

export function Catalog({ blocked }: { blocked: string | null }) {
  const [summaries, setSummaries] = useState<ActionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setSummaries(await listActions())
      setError(null)
    } catch (e) {
      setSummaries(null)
      setError(e instanceof ExecutorError ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <section className="card">
      <h2>Каталог действий</h2>
      {error && <p className="bad">{error}</p>}
      {summaries === null && !error && <p className="muted">загрузка…</p>}
      {summaries?.length === 0 && <p className="muted">записей нет</p>}
      {summaries?.map((summary) => (
        <ActionCard key={summary.actionId} summary={summary} blocked={blocked} onChange={reload} />
      ))}
      <button className="link" onClick={() => void reload()}>
        обновить
      </button>
    </section>
  )
}

function ActionCard({
  summary,
  blocked,
  onChange,
}: {
  summary: ActionSummary
  /** Почему действия недоступны, либо null. Показывается рядом с кнопками. */
  blocked: string | null
  onChange: () => void
}) {
  const client = usePublicClient({ chainId: summary.chainId })
  const wagmi = useConfig()
  const { signTypedDataAsync, isPending: signing } = useSignTypedData()
  const { writeContractAsync, isPending: writing } = useWriteContract()

  const [decoded, setDecoded] = useState<DecodedAction | null>(null)
  const [raw, setRaw] = useState<RawAction | null>(null)
  const [report, setReport] = useState<PositionReport | null>(null)
  const [caveats, setCaveats] = useState<CaveatView[]>([])
  const [unknownPosition, setUnknownPosition] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [executionId, setExecutionId] = useState<string | null>(null)
  const [confirmingExecute, setConfirmingExecute] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [full, bytes] = await Promise.all([
        fetchAction(summary.actionId),
        fetchActionRaw(summary.actionId),
      ])
      setDecoded(full)
      setRaw(bytes)
      setCaveats(await describeCaveats(full.steps[0].delegations[0].caveats, client))

      const execution = {
        target: full.steps[0].execution.target,
        value: BigInt(full.steps[0].execution.value),
        callData: full.steps[0].execution.callData,
      }
      const adapter = adapterFor(full.chainId, execution)
      if (!adapter || !client) {
        setUnknownPosition(true)
        setReport(null)
        return
      }
      setUnknownPosition(false)
      setReport(
        await adapter.inspect({
          client,
          delegator: full.steps[0].delegations[0].delegator,
          execution,
        }),
      )
    } catch (e) {
      setError(e instanceof ExecutorError ? e.message : String(e))
    }
  }, [summary.actionId, client])

  useEffect(() => {
    void load()
  }, [load])

  async function onSign() {
    if (!raw) return
    setError(null)
    setBusy('sign')
    try {
      // Подписывается каждый шаг: своя делегация — своя подпись.
      const signatures: Hex[] = []
      for (const step of raw.steps) {
        signatures.push(await signTypedDataAsync(typedDataFor(step, raw.chainId)))
      }
      await attachSignatures(raw.actionId, signatures)
      onChange()
      await load()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Запуск исполнения. Временная кнопка: в рабочем интерфейсе исполнение
   * запускают источники сигналов (6 executor-stage-1), а не человек. Нужна,
   * пока сквозной путь проверяется руками.
   */
  async function onExecute() {
    setError(null)
    setConfirmingExecute(false)
    setBusy('execute')
    try {
      const started = await postExecute([summary.actionId])
      setExecutionId(started.executionId)
      await load()
    } catch (e) {
      setError(e instanceof ExecutorError ? `${e.code}: ${e.message}` : message(e))
    } finally {
      setBusy(null)
    }
  }

  async function onRemedy(remedy: Remedy) {
    setError(null)
    setBusy(remedy.id)
    try {
      await writeContractAsync({
        address: remedy.call.address,
        abi: remedy.call.abi as Abi,
        functionName: remedy.call.functionName,
        args: remedy.call.args as readonly unknown[],
      })
      await load()
    } catch (e) {
      setError(message(e))
    } finally {
      setBusy(null)
    }
  }

  // Кнопка гаснет не только из-за кошелька: пока запись не загрузилась,
  // подписывать нечего. Причина должна называться в обоих случаях.
  const unavailable = summary.spent
    ? 'запись исполнена и израсходована'
    : (blocked ?? (raw === null ? 'запись не загрузилась из Executor' : null))

  const mark = markFor(summary, report)
  const delegation = decoded?.steps[0].delegations[0]
  const network = wagmi.chains.find((chain) => chain.id === summary.chainId)?.name ?? summary.chainId

  return (
    <details className="action">
      <summary>
        <span className="action-name">{summary.name}</span>
        <span className={`badge ${MARK_CLASS[mark]}`}>{MARK_LABEL[mark]}</span>
        <span className="muted">сеть: {network}</span>
      </summary>

      <p className="muted mono">
        {summary.actionId} · версия {summary.version}
        {!summary.enabled && ' · выключена'}
      </p>

      {decoded?.spentBy && (
        <p className="muted">
          Статус: запись исполнена
          {decoded.spentBy.txHash && (
            <>
              {' '}
              <a href={BASESCAN_TX(decoded.spentBy.txHash)} target="_blank" rel="noreferrer">
                транзакцией {short(decoded.spentBy.txHash)}
              </a>
            </>
          )}
          {decoded.spentBy.blockNumber !== null && `, блок ${decoded.spentBy.blockNumber}`}. Повторно
          она неисполнима: LimitedCalls исчерпан.
        </p>
      )}

      {report && !summary.spent && (
        <p className={MARK_CLASS[mark]}>
          Статус: {mark === 'ok' && '✓ '}
          {report.reason}
        </p>
      )}
      {unknownPosition && !summary.spent && (
        <p className="warn">
          позиция не распознана: адаптера для этого контракта нет, сверить запись с состоянием
          сети нечем
        </p>
      )}

      {report && report.summary.length > 0 && (
        <>
          <h2>Что делает запись</h2>
          <dl className="summary">
            {report.summary.map((row, index) => (
              <div key={`${row.label}-${index}`}>
                <dt>{row.label}</dt>
                <dd className="mono">{row.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {report && report.checks.length > 0 && (
        <>
          <h2>Сверка с позицией</h2>
          <ul className="checks">
            {report.checks.map((check) => (
              <li key={check.label} className={check.ok ? 'ok' : 'fail'}>
                <span>{check.ok ? '✓' : '✗'}</span> {check.label}
                {check.detail && <em className="mono"> — {check.detail}</em>}
              </li>
            ))}
          </ul>
        </>
      )}

      {caveats.length > 0 && (
        <>
          <h2>Проверки (ончейн)</h2>
          <p className="muted">
            Эти проверки выполняются ончейн при исполнении действия и отвергают транзакцию, если
            хотя бы одна не проходит.
          </p>
          <ul className="checks">
            {caveats.map((caveat, index) => (
              <li key={`${caveat.enforcer}-${index}`}>
                {caveat.name}
                <Hint trigger="?">{caveat.hint}</Hint>
                {caveat.summary && <em> — {caveat.summary}</em>}{' '}
                <Hint trigger={<code className="mono">{short(caveat.terms)}</code>}>
                  <span className="mono bubble-data">{caveat.terms}</span>
                  <Copy value={caveat.terms} />
                </Hint>
              </li>
            ))}
          </ul>
        </>
      )}

      {delegation && (
        <p className="muted">
          делегат {short(delegation.delegate)} · делегатор {short(delegation.delegator)}
        </p>
      )}

      <div className="row">
        {/* У израсходованной записи кнопки не гаснут, а исчезают: делать с ней
            уже нечего, и мёртвый ряд кнопок только путал бы. */}
        {!summary.spent && summary.status === 'draft' && (
          <button
            onClick={() => void onSign()}
            disabled={unavailable !== null || signing || busy !== null}
          >
            {busy === 'sign' ? 'Подтвердите в кошельке…' : 'Подписать'}
          </button>
        )}
        {!summary.spent &&
          report?.remedies.map((remedy) => (
            <button
              key={remedy.id}
              onClick={() => void onRemedy(remedy)}
              disabled={unavailable !== null || writing || busy !== null}
            >
              {busy === remedy.id ? 'Подтвердите в кошельке…' : remedy.label}
            </button>
          ))}
        {!summary.spent && summary.status === 'signed' && summary.enabled && !confirmingExecute && (
          <button onClick={() => setConfirmingExecute(true)} disabled={busy !== null}>
            Исполнить
          </button>
        )}
        <button className="link" onClick={() => void load()}>
          обновить
        </button>
      </div>

      {confirmingExecute && (
        <div className="card">
          <p className="warn">
            Executor отправит транзакцию в сеть. Запись одноразовая: после успешного исполнения
            она мертва навсегда, а позиция закроется. Продолжить?
          </p>
          <div className="row">
            <button onClick={() => void onExecute()} disabled={busy !== null}>
              {busy === 'execute' ? 'Отправляем…' : 'Да, исполнить'}
            </button>
            <button className="link" onClick={() => setConfirmingExecute(false)}>
              отмена
            </button>
          </div>
        </div>
      )}

      {busy === 'execute' && !executionId && (
        <p className="muted">
          <span className="spinner" />
          Executor валидирует, симулирует и отправляет транзакцию…
        </p>
      )}

      {executionId && <ExecutionProgress executionId={executionId} />}

      {unavailable !== null && <p className="muted">Действия недоступны: {unavailable}.</p>}

      {report?.remedies.map((remedy) => (
        <p key={`${remedy.id}-warn`} className="warn">
          {remedy.warning}
        </p>
      ))}

      {error && <p className="bad">{error}</p>}
    </details>
  )
}

function message(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; name?: string }
  if (err?.name === 'UserRejectedRequestError') return 'отклонено в кошельке'
  // На экране помещается одна строка, а разбираться приходится по коду и data
  // из ответа кошелька. Полный объект — в консоль.
  console.error('[cicada] кошелёк отказал', e)
  return err?.shortMessage ?? err?.message ?? String(e)
}
