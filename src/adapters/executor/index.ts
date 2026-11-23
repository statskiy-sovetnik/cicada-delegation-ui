import type { ZodType } from 'zod'
import type { Hex } from 'viem'

import { EXECUTOR_BASE_URL } from '../../config.ts'
import {
  actionsResponseSchema,
  attachSignatureRequestSchema,
  attachSignatureResponseSchema,
  decodedActionSchema,
  errorResponseSchema,
  executeRequestSchema,
  executeResponseSchema,
  executionSchema,
  rawActionSchema,
} from './schema.ts'

/**
 * Адаптер к API Executor.
 *
 * Знание о формате API сосредоточено здесь: остальной интерфейс работает с
 * выведенными типами и не знает ни путей, ни кодов отказа. Аутентификации пока
 * нет — открытый вопрос 7.2; когда появится, заголовок добавится в одном месте.
 */

export class ExecutorError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ExecutorError'
  }
}

async function call<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(new URL(path, EXECUTOR_BASE_URL), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch (error) {
    throw new ExecutorError('unreachable', `Executor недоступен: ${String(error)}`)
  }

  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    // Код разбирается по error.code, а не по статусу HTTP.
    const parsed = errorResponseSchema.safeParse(payload)
    if (parsed.success) throw new ExecutorError(parsed.data.error.code, parsed.data.error.message)
    throw new ExecutorError('unknown', `Executor ответил ${response.status}`)
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    // Ответ не по контракту. Дальше по этим данным строится подписываемое, так
    // что продолжать нельзя: лучше назвать расхождение, чем подписать мусор.
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'тело'}: ${issue.message}`)
      .join('; ')
    throw new ExecutorError('malformed_response', `ответ не по контракту — ${detail}`)
  }
  return parsed.data
}

export const listActions = () =>
  call('/actions', actionsResponseSchema).then((body) => body.actions)

export const fetchAction = (actionId: string) =>
  call(`/action/${encodeURIComponent(actionId)}`, decodedActionSchema)

/** Сырые байты — авторитетный вариант (4.8). Подписывается именно он. */
export const fetchActionRaw = (actionId: string) =>
  call(`/action/${encodeURIComponent(actionId)}/raw`, rawActionSchema)

export function attachSignatures(actionId: string, signatures: Hex[]) {
  // Тело проверяется до отправки: ошибку видно здесь, а не по ответу Executor.
  const body = attachSignatureRequestSchema.parse({ signatures })
  return call(`/action/${encodeURIComponent(actionId)}/signature`, attachSignatureResponseSchema, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/**
 * Запуск исполнения (5.2).
 *
 * Ответ возвращается в момент отправки транзакции, до включения в блок: исход
 * доводится опросом `fetchExecution`.
 */
export function postExecute(ids: string[]) {
  const body = executeRequestSchema.parse({ ids })
  return call('/execute', executeResponseSchema, { method: 'POST', body: JSON.stringify(body) })
}

export const fetchExecution = (executionId: string) =>
  call(`/execution/${encodeURIComponent(executionId)}`, executionSchema)

export type {
  ActionStatus,
  ActionSummary,
  DecodedAction,
  DecodedCaveat,
  DecodedDelegation,
  DecodedStep,
  ErrorCode,
  ExecuteResponse,
  Execution,
  ExecutionStatus,
  RawAction,
  RawStep,
} from './schema.ts'
