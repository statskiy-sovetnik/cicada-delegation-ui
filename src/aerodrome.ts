import { getAddress, parseAbi } from 'viem'

/**
 * Позиция Aerodrome WETH/VVV на Base, новое развёртывание протокола.
 *
 * Адреса продублированы из клиента оператора (src/operations/aerodromeMetarouterExit.ts).
 * Общий пакет появится позже; пока расхождение ловится тем, что адреса заданы
 * константами в обоих местах и меняются вместе.
 */
export const POOL = getAddress('0xcFC7dC24e9D302976f0B1EFB90a4D9B22b54b2A5')
export const GAUGE = getAddress('0x0201fb8297B493c084d201721D816Fd414BbFcfa')
export const METAROUTER = getAddress('0x0fEf9e88A7b76BCDBF451780C6774FE32965Ee98')

export const GAUGE_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function approve(address spender, uint256 amount)',
])
