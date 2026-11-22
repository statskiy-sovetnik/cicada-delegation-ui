import { z } from 'zod'
import type { Hex } from 'viem'

/**
 * Контракт API Executor со стороны интерфейса.
 *
 * Ответы разбираются схемами, а не кастуются: на основе этих данных строится
 * то, что человек подписывает ключом. Несоответствие формату должно быть видно
 * сразу и названо, а не всплыть неверной подписью.
 *
 * Типы выводятся отсюда через z.infer — второго определения не существует.
 */

const hex = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, { error: 'ожидается hex-строка с префиксом 0x' })
  .transform((value) => value as Hex)

const nonEmptyHex = z
  .string()
  .regex(/^0x[0-9a-fA-F]+$/, { error: 'ожидается непустая hex-строка с префиксом 0x' })
  .transform((value) => value as Hex)

const slug = z.string().min(1).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
  error: 'ожидается слаг в нижнем регистре, слова через дефис',
})

export const actionStatusSchema = z.enum(['draft', 'signed'])

export const actionSummarySchema = z.object({
  actionId: slug,
  name: z.string(),
  chainId: z.number().int().positive(),
  enabled: z.boolean(),
  status: actionStatusSchema,
  version: z.number().int().positive(),
  createdAt: z.string(),
})

export const actionsResponseSchema = z.object({
  actions: z.array(actionSummarySchema),
})

export const decodedCaveatSchema = z.object({
  enforcer: nonEmptyHex,
  /** Название энфорсера либо `unknown enforcer 0x…`, если он незнаком. */
  name: z.string(),
  terms: hex,
  args: hex,
})

export const decodedDelegationSchema = z.object({
  delegate: nonEmptyHex,
  delegator: nonEmptyHex,
  authority: nonEmptyHex,
  salt: z.string(),
  signed: z.boolean(),
  caveats: z.array(decodedCaveatSchema),
})

export const decodedStepSchema = z.object({
  mode: hex,
  /** Цепочка передоверия: leaf → root. На стадии 1 всегда из одного элемента. */
  delegations: z.array(decodedDelegationSchema).min(1),
  execution: z.object({
    target: nonEmptyHex,
    value: z.string(),
    callData: hex,
  }),
})

export const decodedActionSchema = z.object({
  actionId: slug,
  name: z.string(),
  description: z.string().nullable(),
  chainId: z.number().int().positive(),
  enabled: z.boolean(),
  status: actionStatusSchema,
  version: z.number().int().positive(),
  steps: z.array(decodedStepSchema).min(1),
})

/** Сырые байты — авторитетный вариант (4.8). Подписывается именно он. */
export const rawStepSchema = z.object({
  permissionContext: nonEmptyHex,
  mode: hex,
  executionCalldata: nonEmptyHex,
})

export const rawActionSchema = z.object({
  actionId: slug,
  chainId: z.number().int().positive(),
  status: actionStatusSchema,
  steps: z.array(rawStepSchema).min(1),
})

export const attachSignatureResponseSchema = z.object({
  actionId: slug,
  status: actionStatusSchema,
})

/** Тело PATCH собирается здесь же: формат API знает только адаптер. */
export const attachSignatureRequestSchema = z.object({
  signatures: z.array(nonEmptyHex).min(1),
})

/**
 * Коды отказа. Код 409 приходит и на занятый идентификатор, и на уже
 * исполненное действие, поэтому различать следует по code, а не по статусу.
 */
export const errorCodeSchema = z.enum([
  'action_id_taken',
  'action_executed',
  'validation_failed',
  'unauthorized',
])

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
  }),
})

export type ActionStatus = z.infer<typeof actionStatusSchema>
export type ActionSummary = z.infer<typeof actionSummarySchema>
export type DecodedCaveat = z.infer<typeof decodedCaveatSchema>
export type DecodedDelegation = z.infer<typeof decodedDelegationSchema>
export type DecodedStep = z.infer<typeof decodedStepSchema>
export type DecodedAction = z.infer<typeof decodedActionSchema>
export type RawStep = z.infer<typeof rawStepSchema>
export type RawAction = z.infer<typeof rawActionSchema>
export type ErrorCode = z.infer<typeof errorCodeSchema>
