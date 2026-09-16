import { i18n } from '@/locales'
/**
 * 业务错误码 → 中文映射（临时层）。
 *
 * ## 设计意图
 * 后端全局异常 + i18n 上线后以后端返回的 message 为准；
 * 当后端返回 code≠0 但 message 为空/未定义时，本映射提供兜底中文文案，
 * 避免用户看到原始 code 或空提示。
 *
 * ## 优先级
 * 1. 后端返回 message 非空 → 使用后端文案（为将来 i18n 留口）
 * 2. 后端 message 为空 → 查本映射
 * 3. 本映射无此 code → 降级文案 "业务错误({code})"
 *
 * ## 当前覆盖
 * - 1400–1403: 表单提交校验（对齐后端 FormDefinitionSchema 校验码）
 * - 1500–1505: 表单数据查询校验（对齐后端 FormDataQuery 校验码）
 */
/**
 * 数值码 → 文案键（不是求值结果）。
 *
 * 模块加载期调用 i18n.global.t 会把语言固化：切换语言后这张表里的兜底文案不变，
 * 直到整页刷新——真实浏览器验收已抓到同类缺陷（WorkspaceHome 卡片标题）。
 * 因此这里只存键，取值由 getErrorMessage 在调用时解析。
 */
export const ERROR_CODE_KEYS: Record<number, string> = {
  1400: 'foundation.errUnknownField',
  1401: 'foundation.errRequiredFieldMissing',
  1402: 'foundation.errFieldTypeIncorrect',
  1403: 'foundation.errDictValueOutOfRange',
  1500: 'foundation.errFormMissingOrUnpublished',
  1501: 'foundation.errFieldUnknown',
  1502: 'foundation.errNotFilterable',
  1503: 'foundation.errOperatorTypeMismatch',
  1504: 'foundation.errOperatorUnsupported',
  1505: 'foundation.errRecordReferenced',
  1507: 'foundation.errRecordNotFound',
  1508: 'foundation.errRecordModified',
  /* ── 表单发布校验（1204-1208）──
   * 兜底文案必须与后端 FormErrorCode 同码语义一致（P61 验收标准 3）：
   * 1204 FIELD_TYPE_UNKNOWN / 1205 FIELD_TYPE_DISABLED / 1206 FIELD_ATTR_MISSING /
   * 1207 FIELD_NESTED_TABLE / 1208 DEFINITION_INVALID。
   * 设计器本地的发布预检文案属于 Web 语义键，不是后端错误码，不得写进本表。
   * 本表仅在后端 msg 为空时兜底；正常路径以后端文案为准。 */
  1204: 'foundation.errFieldTypeUnknown',
  1205: 'foundation.errFieldTypeNotOpen',
  1206: 'foundation.errFieldAttributeMissing',
  1207: 'foundation.errTableFieldNested',
  1208: 'foundation.errDefinitionInvalid',
  /* ── 登录安全（2101-2104）──
   * 该数值同时被流程模块占用（BpmErrorCode 2101-2104，同值不同义），已登记为弃用冲突值。
   * 因此**不得**仅凭这些数值选择业务文案：只有当响应携带 errorKey（auth.*）或本表兜底被
   * 命中且可确认来自登录链时才使用；无法确认时用安全通用兜底。 */
  2101: 'foundation.errCaptchaIncorrect',
  2102: 'foundation.errCaptchaExpired',
  2103: 'foundation.errClockSkew',
  2104: 'foundation.errBadCredentials',
  /* ── P52 表单工作台（form 1000-1301 / bpm 2009，对齐后端 FormErrorCode/BpmErrorCode） ── */
  1000: 'foundation.errFormNotFound',
  1001: 'form.keyDuplicate',
  1002: 'foundation.errFormNameExists',
  1100: 'foundation.errFormPublishedImmutable',
  1101: 'foundation.errFormInDraft',
  1102: 'foundation.errFormUnpublished',
  1200: 'foundation.errFieldNameInvalid',
  1201: 'foundation.errFieldNameDuplicate',
  1202: 'foundation.errDynamicTableExists',
  1203: 'foundation.errFormPublishFailed',
  1300: 'foundation.errFormConfigNotFound',
  1301: 'foundation.errFormVersionNotFound',
  2009: 'foundation.errBoundFormNotFound',
  /* 2105 同样是冲突数值：auth 未占用，但流程语义（bpm.process_def_published）需以 errorKey 确认 */
  2105: 'foundation.errProcessDefPublished',
  /* ── 鉴权与流程实例 ── */
  403: 'foundation.errPermissionDenied',
  2313: 'foundation.errInstanceFailed',
}

/**
 * 获取可读的错误提示文案。
 * @param code         业务错误码
 * @param backendMessage 后端返回的 message（可能为空）
 */
export function getErrorMessage(code: number, backendMessage?: string): string {
  if (backendMessage) return backendMessage
  const key = ERROR_CODE_KEYS[code]
  return key ? i18n.global.t(key) : i18n.global.t('foundation.businessError', { code })
}
