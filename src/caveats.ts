import { formatUnits, getAddress, parseAbi, size, slice, type Address, type Hex, type PublicClient } from 'viem'

import type { CaveatView } from './types/index.ts'
import type { DecodedCaveat } from './adapters/executor/index.ts'

/**
 * Расшифровка кейвитов для показа.
 *
 * Общая, не позиционная: энфорсеры принадлежат Delegation Framework и одинаковы
 * для всех позиций. Символ и decimals токена читаются ончейн, поэтому знание о
 * конкретных токенах сюда не попадает.
 */

const ERC20_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
])

const HINTS: Record<string, string> = {
  ExactExecutionEnforcer:
    'Сверяет вызов целиком — адрес контракта, сумму и все аргументы — с тем, что было подписано. ' +
    'Любое отличие отвергает транзакцию.',
  ExactCalldataEnforcer:
    'Сверяет аргументы вызова с подписанными. Адрес контракта и сумму не проверяет.',
  LimitedCallsEnforcer:
    'Ограничивает, сколько раз делегацию можно исполнить. Исчерпанный лимит делает запись ' +
    'неисполнимой навсегда — это и обеспечивает одноразовость.',
  NonceEnforcer:
    'Привязывает делегацию к счётчику делегатора. Делегатор может сдвинуть счётчик и разом ' +
    'отозвать все подписанные записи.',
  ERC20BalanceChangeEnforcer:
    'Запоминает баланс получателя до исполнения и проверяет после. Если баланс вырос меньше ' +
    'чем на указанную величину, транзакция отвергается.',
  AllowedTargetsEnforcer: 'Ограничивает список контрактов, которые можно вызвать.',
  AllowedMethodsEnforcer: 'Ограничивает список методов, которые можно вызвать.',
  ValueLteEnforcer: 'Ограничивает сверху сумму нативной валюты в вызове.',
  AllowedCalldataEnforcer: 'Прибивает отдельные байты аргументов по смещению.',
}

const UNKNOWN_HINT =
  'Энфорсер не опознан: что он проверяет, интерфейс не знает. Судить о записи по этой строке нельзя.'

const plural = (n: bigint, one: string, few: string, many: string): string => {
  const mod100 = Number(n % 100n)
  const mod10 = Number(n % 10n)
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/** Кэш на адрес: у записи обычно несколько кейвитов по одним и тем же токенам. */
const tokenCache = new Map<string, { symbol: string; decimals: number }>()

async function tokenInfo(
  client: PublicClient,
  token: Address,
): Promise<{ symbol: string; decimals: number }> {
  const key = token.toLowerCase()
  const cached = tokenCache.get(key)
  if (cached) return cached
  try {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }),
      client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
    ])
    const info = { symbol, decimals }
    tokenCache.set(key, info)
    return info
  } catch {
    // Токен не отвечает — показываем адрес и сырое число, а не выдуманные единицы.
    return { symbol: token, decimals: 0 }
  }
}

async function summarize(
  caveat: DecodedCaveat,
  client: PublicClient | undefined,
): Promise<string | null> {
  const terms = caveat.terms as Hex

  if (caveat.name === 'LimitedCallsEnforcer' && size(terms) === 32) {
    const limit = BigInt(terms)
    return `${limit} ${plural(limit, 'вызов', 'вызова', 'вызовов')}`
  }

  if (caveat.name === 'NonceEnforcer' && size(terms) === 32) {
    return `счётчик ${BigInt(terms)}`
  }

  if (caveat.name === 'ERC20BalanceChangeEnforcer' && size(terms) === 73) {
    // 1 байт направления, 20 токен, 20 получатель, 32 величина.
    const decrease = slice(terms, 0, 1) === '0x01'
    const token = getAddress(slice(terms, 1, 21))
    const amount = BigInt(slice(terms, 41, 73))
    const info = client ? await tokenInfo(client, token) : { symbol: token, decimals: 0 }
    const value = formatUnits(amount, info.decimals)
    return decrease
      ? `${info.symbol}, убыль не больше ${value}`
      : `${info.symbol}, не меньше ${value}`
  }

  if (caveat.name === 'ExactExecutionEnforcer' && size(terms) >= 52) {
    const target = getAddress(slice(terms, 0, 20))
    const value = BigInt(slice(terms, 20, 52))
    const bytes = size(terms) - 52
    return `вызов к ${target}, ${value} wei, ${bytes} байт аргументов`
  }

  if (caveat.name === 'ValueLteEnforcer' && size(terms) === 32) {
    return `не больше ${BigInt(terms)} wei`
  }

  return null
}

export async function describeCaveats(
  caveats: readonly DecodedCaveat[],
  client: PublicClient | undefined,
): Promise<CaveatView[]> {
  return Promise.all(
    caveats.map(async (caveat) => ({
      enforcer: caveat.enforcer,
      name: caveat.name,
      terms: caveat.terms,
      summary: await summarize(caveat, client),
      hint: HINTS[caveat.name] ?? UNKNOWN_HINT,
    })),
  )
}
