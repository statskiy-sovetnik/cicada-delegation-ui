import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http } from 'viem'
import { base } from 'wagmi/chains'

import { RPC_URL, WC_PROJECT_ID } from './config.ts'

/**
 * Только Base: позиция, гейдж и роутер живут там. RainbowKit сам покажет
 * «Wrong network», если кошелёк окажется в другой сети.
 */
export const wagmiConfig = getDefaultConfig({
  appName: 'Cicada Delegation',
  projectId: WC_PROJECT_ID,
  chains: [base],
  transports: { [base.id]: http(RPC_URL) },
  ssr: false,
})
