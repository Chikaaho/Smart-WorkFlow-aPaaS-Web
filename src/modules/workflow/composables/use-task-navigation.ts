import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'

/** useTaskNavigation 入参。 */
export interface TaskNavigationOptions {
  /** 是否嵌入统一详情弹窗（办理完成后只发 completed，不做整页导航）。 */
  embedded: () => boolean
  /** 弹窗内办理完成回调（embedded 场景由列表关闭弹窗并刷新）。 */
  emitCompleted: () => void
}

/** 任务详情页导航（TaskDetail 页拆分）：返回上一页与办理完成后的去向。 */
export function useTaskNavigation(options: TaskNavigationOptions) {
  const { t } = useI18n()
  const router = useRouter()

  /**
   * 0.1.7 #20：返回上一页。vue-router 4 在 history.state.back 记录应用内来源，
   * 有来源即 router.back()（待办/已办/我发起的等入口天然各自回自己的列表）；
   * 直达打开无历史时兜底回工作台待办。
   */
  function hasInAppHistory(): boolean {
    const back = window.history.state?.back
    return typeof back === 'string' && back !== ''
  }

  function goBack() {
    if (hasInAppHistory()) {
      router.back()
      return
    }
    void router.push({ name: 'workspace-todo' })
  }

  /** 返回按钮文案：V012-BUG-013 精简为「返回」。 */
  const backLabel = computed(() => t('common.backShort'))

  /**
   * 审批 API 已成功提交后，页面导航失败不应被误报为审批失败。
   * 例如重复导航、守卫竞态或目标页面刷新都可能让 router.push reject，
   * 但此时业务动作已经落库，不能再显示相反的错误提示。
   * 0.1.7 #20：审批结束（通过/驳回及转办委托等完成动作）后返回上一页。
   */
  async function navigateAfterAction() {
    // 弹窗内办理完成后关闭弹窗并由列表刷新，不触发整页导航。
    if (options.embedded()) {
      options.emitCompleted()
      return
    }
    try {
      if (hasInAppHistory()) {
        router.back()
      } else {
        await router.push({ name: 'workspace-todo' })
      }
    } catch {
      // 业务动作已完成，导航失败不影响动作结果。
    }
  }

  return { goBack, backLabel, navigateAfterAction }
}
