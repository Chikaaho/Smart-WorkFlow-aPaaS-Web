/**
 * 表单工作台纯函数（P52）。
 *
 * 保存状态机文案与脏判定集中在此，便于单测；组件层只消费。
 * 状态语义（方向 §3.1）：
 *   - 未修改 / 未保存 / 保存中 / 保存成功 / 保存失败 五态；
 *   - 保存失败不得显示成功，也不得清除未保存标记（isDirty 仍为 true）。
 */

/** 瞬态阶段：idle=无进行中动作；saving/saved/error 为一次保存动作的瞬态。 */
export type WorkbenchSavePhase = 'idle' | 'saving' | 'saved' | 'error'

/** 工作台保存状态（展示文案）。 */
export type WorkbenchSaveState = '未修改' | '未保存' | '保存中' | '保存成功' | '保存失败'

/**
 * 解析当前应展示的保存状态。
 *
 * - saving 期间恒为「保存中」（重复点击/慢响应不得闪回其他态）；
 * - saved / error 为瞬态结果，由调用方在下次编辑或重试时回到 idle；
 * - idle 时按脏标记区分「未修改 / 未保存」。
 */
export function resolveSaveState(isDirty: boolean, phase: WorkbenchSavePhase): WorkbenchSaveState {
  if (phase === 'saving') return '保存中'
  if (phase === 'saved') return '保存成功'
  if (phase === 'error') return '保存失败'
  return isDirty ? '未保存' : '未修改'
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

export const LEAVE_GUARD_MESSAGE = '当前表单存在未保存的修改，离开将丢失这些修改。'
