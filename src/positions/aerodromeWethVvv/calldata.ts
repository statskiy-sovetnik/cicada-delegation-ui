import { decodeAbiParameters, decodeFunctionData, getAddress, type Hex } from 'viem'

import { METAROUTER_ABI } from './addresses.ts'
import type { ExitParams } from './types.ts'

/**
 * Разбор calldata `Metarouter.execute` обратно в параметры выхода.
 *
 * Через ABI, а не по смещениям: раскладка при двух командах статична, но
 * вычитать байты по константам — значит молча разъехаться с записью, если
 * состав команд изменится.
 */

const UNSTAKE_GAUGE = 0x2a
const REMOVE_LIQUIDITY = 0x23

const REMOVE_LIQUIDITY_PARAMS = [
  {
    type: 'tuple',
    components: [
      { name: 'pool', type: 'address' },
      {
        name: 'lpSpend',
        type: 'tuple',
        components: [
          { name: 'mode', type: 'uint8' },
          { name: 'value', type: 'uint256' },
        ],
      },
      { name: 'payerIsUser', type: 'bool' },
      { name: 'amount0Min', type: 'uint256' },
      { name: 'amount1Min', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
  },
] as const

export class UnknownCalldataError extends Error {}

export function decodeExit(callData: Hex): ExitParams {
  let commands: Hex
  let inputs: readonly Hex[]
  try {
    const decoded = decodeFunctionData({ abi: METAROUTER_ABI, data: callData })
    const args = decoded.args as readonly [Hex, readonly Hex[], bigint]
    commands = args[0]
    inputs = args[1]
  } catch (error) {
    throw new UnknownCalldataError(`это не вызов Metarouter.execute: ${String(error)}`)
  }

  const bytes = commands.slice(2)
  if (bytes.length !== 4 || inputs.length !== 2) {
    throw new UnknownCalldataError(`ожидались две команды, пришло ${bytes.length / 2}`)
  }
  // Старший бит байта команды — флаг allow-revert, идентификатор в младших семи.
  const ids = [parseInt(bytes.slice(0, 2), 16) & 0x7f, parseInt(bytes.slice(2, 4), 16) & 0x7f]
  if (ids[0] !== UNSTAKE_GAUGE || ids[1] !== REMOVE_LIQUIDITY) {
    throw new UnknownCalldataError(
      `ожидались UNSTAKE_GAUGE и REMOVE_LIQUIDITY, пришли 0x${ids[0].toString(16)} и 0x${ids[1].toString(16)}`,
    )
  }

  const [gauge] = decodeAbiParameters(
    [{ type: 'address' }, { type: 'bytes' }, { type: 'bool' }],
    inputs[0],
  )
  const [params] = decodeAbiParameters(REMOVE_LIQUIDITY_PARAMS, inputs[1])

  return {
    gauge: getAddress(gauge),
    pool: getAddress(params.pool),
    lpAmount: params.lpSpend.value,
    amount0Min: params.amount0Min,
    amount1Min: params.amount1Min,
    recipient: getAddress(params.recipient),
  }
}
