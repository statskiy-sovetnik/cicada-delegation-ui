import { formatUnits, getAddress, type Address } from 'viem'

import type {
  Check,
  Execution,
  InspectInput,
  PositionAdapter,
  PositionReport,
  Remedy,
  SummaryRow,
  Verdict,
} from '../../types/index.ts'
import { CHAIN_ID, GAUGE, GAUGE_ABI, METAROUTER, POOL } from './addresses.ts'
import { decodeExit, UnknownCalldataError } from './calldata.ts'
import type { ExitParams, PositionState } from './types.ts'

/**
 * Адаптер позиции Aerodrome WETH/VVV на Base.
 *
 * Сверяет две величины (5.1 ui-stage-1): хватает ли апрува Metarouter на сумму
 * из записи и хватает ли самого стейка. Апрув нужен потому, что роутер снимает
 * стейк за владельца через `withdrawFrom`.
 */

async function readState(input: InspectInput): Promise<PositionState> {
  const gauge = { address: GAUGE, abi: GAUGE_ABI } as const
  const [staked, allowance, blanketApproval] = await Promise.all([
    input.client.readContract({ ...gauge, functionName: 'balanceOf', args: [input.delegator] }),
    input.client.readContract({
      ...gauge,
      functionName: 'allowance',
      args: [input.delegator, METAROUTER],
    }),
    input.client.readContract({
      ...gauge,
      functionName: 'isApprovedForAll',
      args: [input.delegator, METAROUTER],
    }),
  ])
  return { staked, allowance, blanketApproval }
}

const lp = (value: bigint) => `${formatUnits(value, 18)} LP`

function buildChecks(exit: ExitParams, state: PositionState, delegator: Address): Check[] {
  const approvalEnough = state.blanketApproval || state.allowance >= exit.lpAmount
  return [
    {
      label: 'апрув Metarouter покрывает вывод',
      ok: approvalEnough,
      detail: state.blanketApproval
        ? 'выдан бессрочный (setApprovalForAll)'
        : `${lp(state.allowance)} против ${lp(exit.lpAmount)}`,
    },
    {
      label: 'стейка хватает на вывод',
      ok: state.staked >= exit.lpAmount,
      detail: `${lp(state.staked)} против ${lp(exit.lpAmount)}`,
    },
    {
      // Получатель прибит в calldata вместе со всем исполнением, но подписать
      // запись с чужим получателем никто не мешает — сверяем явно.
      label: 'средства вернутся делегатору',
      ok: getAddress(exit.recipient) === getAddress(delegator),
      detail: exit.recipient,
    },
  ]
}

function verdictFor(exit: ExitParams, state: PositionState, checks: Check[]): {
  verdict: Verdict
  reason: string
} {
  const failed = checks.find((check) => !check.ok)
  if (failed) {
    return { verdict: 'critical', reason: `не выполнено: ${failed.label}` }
  }
  if (state.staked > exit.lpAmount) {
    const left = state.staked - exit.lpAmount
    return { verdict: 'warning', reason: `выход частичный, в позиции останется ${lp(left)}` }
  }
  return { verdict: 'ok', reason: 'запись соответствует позиции' }
}

function summaryFor(exit: ExitParams): SummaryRow[] {
  return [
    { label: 'снимается с гейджа', value: lp(exit.lpAmount) },
    { label: 'получатель', value: exit.recipient },
    { label: 'не меньше', value: `${formatUnits(exit.amount0Min, 18)} WETH` },
    { label: 'не меньше', value: `${formatUnits(exit.amount1Min, 18)} VVV` },
    { label: 'гейдж', value: exit.gauge },
    { label: 'пул', value: exit.pool },
  ]
}

function remediesFor(exit: ExitParams, state: PositionState): Remedy[] {
  if (state.blanketApproval || state.allowance >= exit.lpAmount) return []
  return [
    {
      id: 'approve-metarouter',
      label: 'Approve Metarouter',
      warning:
        `Metarouter получит право снять ${lp(exit.lpAmount)} с вашего стейка. ` +
        'Право списывается при первом выходе.',
      call: {
        address: GAUGE,
        abi: GAUGE_ABI,
        functionName: 'approve',
        args: [METAROUTER, exit.lpAmount],
      },
    },
  ]
}

export const aerodromeWethVvv: PositionAdapter = {
  id: 'aerodrome-weth-vvv',
  title: 'Aerodrome vAMMV2-WETH/VVV на Base',

  matches(chainId: number, execution: Execution): boolean {
    return chainId === CHAIN_ID && getAddress(execution.target) === METAROUTER
  },

  async inspect(input: InspectInput): Promise<PositionReport> {
    let exit: ExitParams
    try {
      exit = decodeExit(input.execution.callData)
    } catch (error) {
      // Адаптер взялся за шаг по целевому контракту, но calldata не та. Молча
      // показывать «всё в порядке» нельзя: непонятая запись опаснее понятой.
      const detail = error instanceof UnknownCalldataError ? error.message : String(error)
      return {
        verdict: 'critical',
        reason: `запись не разбирается как выход из этой позиции: ${detail}`,
        checks: [],
        summary: [],
        remedies: [],
      }
    }

    if (getAddress(exit.pool) !== POOL || getAddress(exit.gauge) !== GAUGE) {
      return {
        verdict: 'critical',
        reason: `запись работает с другим пулом или гейджем: ${exit.pool}, ${exit.gauge}`,
        checks: [],
        summary: summaryFor(exit),
        remedies: [],
      }
    }

    const state = await readState(input)
    const checks = buildChecks(exit, state, input.delegator)
    const { verdict, reason } = verdictFor(exit, state, checks)

    return {
      verdict,
      reason,
      checks,
      summary: [
        ...summaryFor(exit),
        {
          label: 'доля позиции',
          value:
            state.staked === 0n
              ? 'позиции нет'
              : `${((Number(exit.lpAmount) / Number(state.staked)) * 100).toFixed(2)}%`,
        },
      ],
      remedies: remediesFor(exit, state),
    }
  },
}
