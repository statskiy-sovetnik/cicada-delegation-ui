import { decodeDelegations, SIGNABLE_DELEGATION_TYPED_DATA } from '@metamask/smart-accounts-kit/utils'
import type { Hex } from 'viem'

import type { RawStep } from './adapters/executor/index.ts'

/**
 * Сборка EIP-712 структуры делегации для подписи.
 *
 * Расшифровка делается здесь, из сырых байтов записи, а не берётся из
 * `GET /action/{id}`: авторитетен сырой вариант (4.8), и человек должен
 * подписывать то, что расшифровал сам интерфейс, а не то, что ему показал
 * Executor. Ошибка в декодере Executor тогда не меняет подписываемое.
 */

/** Канонический DelegationManager: один и тот же адрес во всех сетях. */
const DELEGATION_MANAGER = '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3' as const

export const domainFor = (chainId: number) =>
  ({
    name: 'DelegationManager',
    version: '1',
    chainId,
    verifyingContract: DELEGATION_MANAGER,
  }) as const

/**
 * `EIP712Domain` объявляется явно, хотя на хеш не влияет.
 *
 * viem при сериализации для кошелька оставляет в домене только те поля, что
 * описаны в `types.EIP712Domain`. Без этого описания в `eth_signTypedData_v4`
 * уходит `"domain": {}`, и MetaMask отвечает «An internal error was received».
 * Справочник кита такого типа не содержит — он нужен только на пути к кошельку.
 */
const EIP712_DOMAIN = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const

export class SingleDelegationError extends Error {}

/**
 * Подписывается одна делегация на шаг: передоверия на стадии 1 нет, цепочка
 * всегда из одного элемента.
 */
export function typedDataFor(step: RawStep, chainId: number) {
  const delegations = decodeDelegations(step.permissionContext)
  if (delegations.length !== 1) {
    throw new SingleDelegationError(
      `в цепочке ${delegations.length} делегаций, на стадии 1 ожидается одна`,
    )
  }
  const delegation = delegations[0]

  return {
    domain: domainFor(chainId),
    types: { EIP712Domain: EIP712_DOMAIN, ...SIGNABLE_DELEGATION_TYPED_DATA },
    primaryType: 'Delegation' as const,
    message: {
      delegate: delegation.delegate,
      delegator: delegation.delegator,
      authority: delegation.authority,
      // args в подпись не входят — только enforcer и terms.
      caveats: delegation.caveats.map((caveat) => ({
        enforcer: caveat.enforcer,
        terms: caveat.terms,
      })),
      salt: BigInt((delegation.salt ?? '0x00') as Hex),
    },
  }
}

export const delegatorOf = (step: RawStep): Hex =>
  decodeDelegations(step.permissionContext)[0].delegator as Hex
