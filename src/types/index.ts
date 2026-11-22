/**
 * Общие типы. Контракт API Executor сюда не входит: его типы выводятся из
 * zod-схем в src/adapters/executor/schema.ts, и второго определения быть не
 * должно. Типы конкретной позиции живут в её папке.
 */
export type {
  Check,
  Execution,
  InspectInput,
  PositionAdapter,
  PositionReport,
  Remedy,
  SummaryRow,
  Verdict,
} from './position.ts'

export type { CaveatView } from './caveat.ts'
