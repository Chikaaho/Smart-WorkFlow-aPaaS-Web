import { i18n } from '@/locales'
/**
 * 失败分类（与后端 `FailureCategory` 同一词汇，P61 §3.5）。
 *
 * 目的：网络中断、超时、401、403、404、409/业务冲突、5xx 与客户端异常必须进入
 * **不同且可复核**的展示语义，不再一律塌缩成「操作失败」「加载失败」。
 *
 * 分类只描述「发生了什么类型的失败」，不承担业务分流；业务分流以 `errorKey` 为准。
 */
export type FailureCategory =
  | 'INPUT_CORRECTABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'OBJECT_NOT_FOUND'
  | 'BUSINESS_CONFLICT'
  | 'IN_PROGRESS'
  | 'RETRYABLE_INFRASTRUCTURE'
  | 'NON_RETRYABLE_CONFIGURATION'
  | 'SYSTEM_FAULT'

interface CategorySpec {
  /** 面向用户的默认结论；与后端同类失败的结论保持一致。 */
  message: string
  /** 重试是否有用；供页面决定是否提供重试入口。 */
  retryable: boolean
  /** 恢复动作提示。 */
  recovery: string
}

export const FAILURE_CATEGORY_SPECS: Record<FailureCategory, CategorySpec> = {
  INPUT_CORRECTABLE: {
    get message() {
      return i18n.global.t('errors.inputInvalid')
    },
    retryable: false,
    get recovery() {
      return i18n.global.t('foundation.fixInput')
    },
  },
  AUTHENTICATION_REQUIRED: {
    get message() {
      return i18n.global.t('errors.sessionExpired')
    },
    retryable: false,
    get recovery() {
      return i18n.global.t('foundation.signInAgain')
    },
  },
  PERMISSION_DENIED: {
    get message() {
      return i18n.global.t('foundation.errPermissionDenied')
    },
    retryable: false,
    get recovery() {
      return i18n.global.t('foundation.contactAdmin')
    },
  },
  OBJECT_NOT_FOUND: {
    get message() {
      return i18n.global.t('errors.notFound')
    },
    retryable: false,
    get recovery() {
      return i18n.global.t('foundation.backToListRefresh')
    },
  },
  BUSINESS_CONFLICT: {
    get message() {
      return i18n.global.t('errors.conflict')
    },
    retryable: true,
    get recovery() {
      return i18n.global.t('foundation.refreshAndRetry')
    },
  },
  IN_PROGRESS: {
    get message() {
      return i18n.global.t('foundation.acceptedInProgress')
    },
    retryable: false,
    get recovery() {
      return i18n.global.t('foundation.checkResultInList')
    },
  },
  RETRYABLE_INFRASTRUCTURE: {
    get message() {
      return i18n.global.t('errors.network')
    },
    retryable: true,
    get recovery() {
      return i18n.global.t('foundation.retryLater')
    },
  },
  NON_RETRYABLE_CONFIGURATION: {
    get message() {
      return i18n.global.t('foundation.notConfigured')
    },
    retryable: false,
    get recovery() {
      return i18n.global.t('foundation.finishConfigOrContactAdmin')
    },
  },
  SYSTEM_FAULT: {
    get message() {
      return i18n.global.t('errors.systemFault')
    },
    retryable: true,
    get recovery() {
      return i18n.global.t('foundation.retryLater')
    },
  },
}

/** 判定 HTTP 状态码所属的失败类别；无状态码（网络/超时/客户端异常）单独判定。 */
export function classifyHttpStatus(status: number): FailureCategory {
  if (status === 400 || status === 422) return 'INPUT_CORRECTABLE'
  if (status === 401) return 'AUTHENTICATION_REQUIRED'
  if (status === 403) return 'PERMISSION_DENIED'
  if (status === 404 || status === 410) return 'OBJECT_NOT_FOUND'
  if (status === 409) return 'BUSINESS_CONFLICT'
  if (status === 429) return 'RETRYABLE_INFRASTRUCTURE'
  if (status === 503 || status === 504) return 'RETRYABLE_INFRASTRUCTURE'
  if (status >= 500) return 'SYSTEM_FAULT'
  return 'SYSTEM_FAULT'
}

/**
 * 判定「没有 HTTP 响应」的失败类别。
 *
 * `ECONNABORTED` 是 axios 的超时码；`ERR_NETWORK` 与响应缺失表示网络不可达。
 * 二者都可重试，但与 5xx 系统故障区分开，便于页面给出不同的重试时机。
 */
export function classifyTransportFailure(code: string | undefined): FailureCategory {
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') return 'RETRYABLE_INFRASTRUCTURE'
  if (code === 'ERR_NETWORK' || code === 'ERR_CANCELED') return 'RETRYABLE_INFRASTRUCTURE'
  return 'SYSTEM_FAULT'
}

/** 该类别是否值得给用户一个重试入口。 */
export function isRetryable(category: FailureCategory): boolean {
  return FAILURE_CATEGORY_SPECS[category].retryable
}

/** 该类别的默认安全结论。 */
export function categoryMessage(category: FailureCategory): string {
  return FAILURE_CATEGORY_SPECS[category].message
}

/**
 * 该类别的恢复动作提示。
 *
 * 与 {@link categoryMessage} 成对使用：结论说明「发生了什么」，恢复动作说明
 * 「下一步该做什么」。可重试类别不得写成「稍后重试以外无动作」，不可重试类别
 * 不得诱导用户重复提交。
 */
export function categoryRecovery(category: FailureCategory): string {
  return FAILURE_CATEGORY_SPECS[category].recovery
}
