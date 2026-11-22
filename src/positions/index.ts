import type { Execution, PositionAdapter } from '../types/index.ts'
import { aerodromeWethVvv } from './aerodromeWethVvv/adapter.ts'

/**
 * Реестр позиций.
 *
 * Добавление новой позиции — это новая папка с адаптером и строчка здесь.
 * Ничего за пределами папки менять не нужно: общий код работает через
 * PositionAdapter и про конкретные протоколы не знает.
 */
export const adapters: readonly PositionAdapter[] = [aerodromeWethVvv]

export function adapterFor(chainId: number, execution: Execution): PositionAdapter | undefined {
  return adapters.find((adapter) => adapter.matches(chainId, execution))
}
