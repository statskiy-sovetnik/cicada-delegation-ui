import type { Abi, Address, Hex, PublicClient } from 'viem'

/**
 * Контракт адаптера позиции.
 *
 * Общий код не знает ни про Aerodrome, ни про любую другую позицию: он берёт
 * шаг записи, находит подходящий адаптер и показывает то, что тот вернул. Вся
 * специфика — какие контракты читать, что с чем сверять, что предложить
 * исправить — живёт внутри адаптера, в своей папке.
 *
 * Логика сверки своя у каждой позиции, см. 5.1 ui-stage-1.
 */

/** Одна проверка записи против состояния сети. */
export type Check = {
  label: string
  ok: boolean
  /** Пояснение: фактическое значение против ожидаемого. */
  detail?: string
}

/** Строка разбора операции для человека: что именно запись собирается сделать. */
export type SummaryRow = {
  label: string
  value: string
}

/**
 * Действие, которым делегатор чинит непройденную проверку, — например выдаёт
 * апрув. Общий код только рисует кнопку и отправляет транзакцию; что именно
 * вызывается, решает адаптер.
 */
export type Remedy = {
  id: string
  label: string
  /** Предупреждение перед отправкой транзакции. */
  warning: string
  call: {
    address: Address
    abi: Abi
    functionName: string
    args: readonly unknown[]
  }
}

/**
 * Приговор по позиции. Статус подписи сюда не входит: он свойство записи, а не
 * позиции, и накладывается общим кодом.
 */
export type Verdict = 'critical' | 'warning' | 'ok'

export type PositionReport = {
  verdict: Verdict
  /** Почему именно такой приговор. */
  reason: string
  checks: Check[]
  summary: SummaryRow[]
  remedies: Remedy[]
}

/** Шаг записи в том виде, в каком его видит адаптер. */
export type Execution = {
  target: Address
  value: bigint
  callData: Hex
}

export type InspectInput = {
  client: PublicClient
  delegator: Address
  execution: Execution
}

export type PositionAdapter = {
  /** Для отладки и выбора в реестре. */
  readonly id: string
  /** Человекочитаемое название позиции. */
  readonly title: string
  /** Берётся ли адаптер за этот шаг. Решается по сети и целевому контракту. */
  matches(chainId: number, execution: Execution): boolean
  /** Читает состояние из сети и сверяет его с тем, что зашито в записи. */
  inspect(input: InspectInput): Promise<PositionReport>
}
