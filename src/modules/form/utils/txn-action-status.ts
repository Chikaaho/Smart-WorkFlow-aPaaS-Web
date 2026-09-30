import { i18n } from '@/locales'
import type {
  TxnActionStatus,
  TxnActionType,
  TxnInvocationStatus,
  TxnReservationStatus,
  TxnLedgerView,
} from '@/modules/form/api/txn-action'

/**
 * 事务动作相关状态 → 中文 label / 标签色 映射。
 *
 * 面向业务语言：不暴露队列、租约、指纹等内部概念；
 * 「等级 → 消息时效」档位也在本文件集中定义，页面只按档位选择。
 */
import type { StatusMapEntry } from '@/modules/form/utils/form-def-status'

/** 动作类型 → 业务 label。 */
export const ACTION_TYPE_MAP: Record<TxnActionType, string> = {
  get RESERVE() {
    return i18n.global.t('txnAction.typeReserve')
  },
  get CONFIRM() {
    return i18n.global.t('txnAction.typeConfirm')
  },
  get RELEASE() {
    return i18n.global.t('txnAction.typeRelease')
  },
  get ADJUST() {
    return i18n.global.t('txnAction.typeAdjust')
  },
}

/** 动作状态 → label / 标签色。 */
export const ACTION_STATUS_MAP: Record<TxnActionStatus, StatusMapEntry> = {
  DRAFT: {
    get label() {
      return i18n.global.t('common.statusDraft')
    },
    type: 'info',
  },
  PUBLISHED: {
    get label() {
      return i18n.global.t('common.statusPublished')
    },
    type: 'success',
  },
  DISABLED: {
    get label() {
      return i18n.global.t('common.statusDisabled')
    },
    type: 'danger',
  },
}

/** 调用结果状态 → label / 标签色（业务语义）。 */
export const INVOCATION_STATUS_MAP: Record<TxnInvocationStatus, StatusMapEntry> = {
  SUCCEEDED: {
    get label() {
      return i18n.global.t('txnAction.invokeSucceeded')
    },
    type: 'success',
  },
  REJECTED: {
    get label() {
      return i18n.global.t('txnAction.invokeRejected')
    },
    type: 'warning',
  },
  CONFLICT: {
    get label() {
      return i18n.global.t('txnAction.invokeConflict')
    },
    type: 'danger',
  },
  FAILED: {
    get label() {
      return i18n.global.t('txnAction.invokeFailed')
    },
    type: 'danger',
  },
}

/** 预占凭据状态 → label / 标签色（业务语义）。 */
export const RESERVATION_STATUS_MAP: Record<TxnReservationStatus, StatusMapEntry> = {
  ACTIVE: {
    get label() {
      return i18n.global.t('txnAction.reservationActive')
    },
    type: 'success',
  },
  CONFIRMED: {
    get label() {
      return i18n.global.t('txnAction.reservationConfirmed')
    },
    type: 'info',
  },
  RELEASED: {
    get label() {
      return i18n.global.t('txnAction.reservationReleased')
    },
    type: 'info',
  },
  EXPIRED: {
    get label() {
      return i18n.global.t('txnAction.reservationExpired')
    },
    type: 'warning',
  },
}

/** 台账类型 → 业务 label。 */
export const LEDGER_TYPE_MAP: Record<TxnLedgerView['entryType'], string> = {
  get RESERVE() {
    return i18n.global.t('txnAction.ledgerReserve')
  },
  get CONFIRM() {
    return i18n.global.t('txnAction.ledgerConfirm')
  },
  get RELEASE() {
    return i18n.global.t('txnAction.ledgerRelease')
  },
  get EXPIRE() {
    return i18n.global.t('txnAction.ledgerExpire')
  },
  get ADJUST() {
    return i18n.global.t('txnAction.ledgerAdjust')
  },
}

/**
 * 时效等级（按等级选择消息/预占时效；页面不暴露原始秒数）。
 * value = 预占有效期秒数（内部映射）。
 */
export interface TimelinessTier {
  /** 等级枚举键。 */
  key: 'REALTIME' | 'PROMPT' | 'STANDARD'
  labelKey: string
  seconds: number
}

export const TIMELINESS_TIERS: TimelinessTier[] = [
  { key: 'REALTIME', labelKey: 'txnAction.tierRealtime', seconds: 60 },
  { key: 'PROMPT', labelKey: 'txnAction.tierPrompt', seconds: 900 },
  { key: 'STANDARD', labelKey: 'txnAction.tierStandard', seconds: 7200 },
]

/** 秒数 → 等级键（未知时回退常规档）。 */
export function tierKeyOfSeconds(seconds?: number | null): TimelinessTier['key'] {
  const hit = TIMELINESS_TIERS.find((t) => t.seconds === seconds)
  return hit ? hit.key : 'STANDARD'
}

/** 等级键 → 秒数。 */
export function secondsOfTierKey(key: TimelinessTier['key']): number {
  const hit = TIMELINESS_TIERS.find((t) => t.key === key)
  return hit ? hit.seconds : 7200
}
