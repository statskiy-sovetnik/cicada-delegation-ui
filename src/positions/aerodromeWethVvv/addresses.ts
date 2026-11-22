import { getAddress, parseAbi } from 'viem'
import { base } from 'viem/chains'

/**
 * Позиция Aerodrome WETH/VVV на Base, новое развёртывание протокола.
 *
 * Адреса продублированы из клиента оператора
 * (src/operations/aerodromeMetarouterExit.ts). Общий пакет появится позже.
 */

export const CHAIN_ID = base.id

export const POOL = getAddress('0xcFC7dC24e9D302976f0B1EFB90a4D9B22b54b2A5')
export const GAUGE = getAddress('0x0201fb8297B493c084d201721D816Fd414BbFcfa')
export const METAROUTER = getAddress('0x0fEf9e88A7b76BCDBF451780C6774FE32965Ee98')
export const WETH = getAddress('0x4200000000000000000000000000000000000006')
export const VVV = getAddress('0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf')

export const GAUGE_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function approve(address spender, uint256 amount)',
])

export const METAROUTER_ABI = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
])
