import type { Address } from 'viem'

/** Типы, относящиеся только к этой позиции. Общий код их не видит. */

/** Параметры выхода, вытащенные из calldata записи. */
export type ExitParams = {
  gauge: Address
  pool: Address
  lpAmount: bigint
  amount0Min: bigint
  amount1Min: bigint
  recipient: Address
}

/** Состояние позиции, прочитанное из сети. */
export type PositionState = {
  staked: bigint
  allowance: bigint
  blanketApproval: boolean
}
