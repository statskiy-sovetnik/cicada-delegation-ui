import type { Hex } from 'viem'

/**
 * Кейвит, подготовленный к показу.
 *
 * Энфорсеры принадлежат Delegation Framework, а не позиции, поэтому расшифровка
 * общая и живёт в src/caveats.ts.
 */
export type CaveatView = {
  enforcer: Hex
  /** Название энфорсера либо `unknown enforcer 0x…`. */
  name: string
  terms: Hex
  /**
   * Короткая расшифровка терма: «1 вызов», «WETH, не меньше 0.00028».
   * Пусто, если энфорсер не опознан или терм не разобрался.
   */
  summary: string | null
  /** Что именно проверяет энфорсер — текст хинта. */
  hint: string
}
