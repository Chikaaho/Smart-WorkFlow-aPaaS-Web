/**
 * 表单工作台纯函数（P52）。
 *
 * 保存状态机语义与脏判定集中在此，便于单测；组件层只消费。
 * 状态语义（方向 §3.1）：
 *   - 未修改 / 未保存 / 保存中 / 保存成功 / 保存失败 五态；
 *   - 保存失败不得显示成功，也不得清除未保存标记（isDirty 仍为 true）。
 *
 * 展示文案一律来自 zh-CN/en-US 权威目录，本模块只产出**状态标识**与目录键，
 * 不持有任何语言的字面量（语言切换与目录一致性由 locales 单源保证）。
 */

/** 瞬态阶段：idle=无进行中动作；saving/saved/error 为一次保存动作的瞬态。 */
export type WorkbenchSavePhase = 'idle' | 'saving' | 'saved' | 'error'

/** 工作台保存状态（语义标识；展示文案见 saveStateKey）。 */
export type WorkbenchSaveState = 'unchanged' | 'unsaved' | 'saving' | 'saveSuccess' | 'saveFailed'

/**
 * 解析当前应展示的保存状态。
 *
 * - saving 期间恒为「保存中」（重复点击/慢响应不得闪回其他态）；
 * - saved / error 为瞬态结果，由调用方在下次编辑或重试时回到 idle；
 * - idle 时按脏标记区分「未修改 / 未保存」。
 */
export function resolveSaveState(isDirty: boolean, phase: WorkbenchSavePhase): WorkbenchSaveState {
  if (phase === 'saving') return 'saving'
  if (phase === 'saved') return 'saveSuccess'
  if (phase === 'error') return 'saveFailed'
  return isDirty ? 'unsaved' : 'unchanged'
}

/** 保存状态 → 权威目录键。 */
export function saveStateKey(state: WorkbenchSaveState): string {
  return `common.${state}`
}

/**
 * 脏判定：当前定义序列化结果与基线不同即为脏。
 * baseline 为最近一次成功加载/保存时的 JSON.stringify 结果。
 */
export function isDefinitionDirty(baseline: string, current: string): boolean {
  return baseline !== current
}

/** 工作台两个工作区。 */
export type WorkbenchTab = 'design' | 'processes'

/** 路由 query 中工作区参数的合法值校验（深链恢复用，非法值回退 design）。 */
export function parseWorkbenchTab(raw: unknown): WorkbenchTab {
  return raw === 'processes' ? 'processes' : 'design'
}

/**
 * 脏状态离开保护的用户选项（方向 §3.2：保存 / 放弃 / 取消 三选一）。
 * 组件层用 ElMessageBox 的 confirm（保存并继续）/ cancel（放弃并继续）/
 * close（取消）三通道映射到该语义。
 */
export type LeaveGuardAction = 'save' | 'discard' | 'cancel'

/**
 * 离开保护提示的文案键。导出键而非求值结果：模块加载期求值会把语言固化，
 * 之后切换语言不会生效。
 */
export const LEAVE_GUARD_MESSAGE_KEY = 'form.unsavedLeaveWarning'
