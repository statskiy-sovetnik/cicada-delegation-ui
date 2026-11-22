/**
 * Конфигурация браузерной половины: значения из .env приходят через виртуальный
 * модуль (см. vite.config.ts).
 */
import { getAddress } from 'viem'

import { ALCHEMY_API_KEY, DELEGATOR_ADDRESS, WALLETCONNECT_PROJECT_ID } from 'virtual:ui-env'

export const RPC_URL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
export const WC_PROJECT_ID = WALLETCONNECT_PROJECT_ID

/**
 * Делегатор, чью позицию обслуживает интерфейс. Кнопки, меняющие состояние,
 * доступны только когда подключён именно этот адрес.
 */
export const DELEGATOR = getAddress(DELEGATOR_ADDRESS)

export const BASESCAN_TX = (hash: string) => `https://basescan.org/tx/${hash}`
