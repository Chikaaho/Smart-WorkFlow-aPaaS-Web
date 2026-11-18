import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { useUserStore } from '@/stores/user'
import { myInstances } from '../api'
import type { TaskDetail } from '@/contracts/bpm'

/** useTaskUrge 入参。 */
export interface TaskUrgeOptions {
  /** 任务详情（响应式）。 */
  detail: Ref<TaskDetail | null>
  /** 页面动作互斥标记（审批/生命周期动作进行中不再催办）。 */
  acting: Ref<string | null>
  /** 是否可办理（当前待办参与人视角）。 */
  canAct: ComputedRef<boolean>
}

/** 催办（TaskDetail 页拆分）：入口可见性、接收人候选与催办提交。 */
export function useTaskUrge(options: TaskUrgeOptions) {
  const { t } = useI18n()
  const userStore = useUserStore()
  const { detail, acting, canAct } = options

  /** 催办对发起人与当前待办参与人呈现；服务端按实例参与人再核验。 */
  const isInitiator = computed(() => {
    const d = detail.value
    const uid = userStore.user?.id
    return d != null && uid != null && String(d.initiatorId ?? '') === String(uid)
  })

  /** 已结束/失败/终止的流程只读：发起人也不能再催办。 */
  const flowActive = computed(() => {
    const d = detail.value
    if (!d) return false
    if (d.instanceStatus != null) return d.instanceStatus === 'RUNNING'
    return d.taskStatus === 'RUNNING'
  })

  const canUrge = computed(
    () => (isInitiator.value || canAct.value) && flowActive.value && hasPerm('workflow:urge'),
  )

  // ── 设计 273:2025 催办弹窗：说明 + 催办留言（可空，服务端限 200 字） ──
  const urgeDialogVisible = ref(false)
  const urgeMessage = ref('')

  /** 可选催办接收人：当前待办人 + 活动参与人（排除自己）；服务端再校验合法子集。 */
  const urgeRecipientOptions = computed<Array<{ id: string; name: string }>>(() => {
    const d = detail.value
    if (!d) return []
    const self = userStore.user?.id != null ? String(userStore.user.id) : ''
    const map = new Map<string, string>()
    const add = (id?: string | null, name?: string | null) => {
      if (!id || !/^\d+$/.test(id) || id === self) return
      map.set(id, name?.trim() || id)
    }
    add(d.assignee, d.assigneeName)
    for (const row of d.approvalHistory ?? []) {
      if (row.endTime == null) add(row.assignee, row.assigneeName)
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  })
  /** 已选接收人；空 = 沿用实例级旧语义（催办全部当前待办人）。 */
  const urgeRecipientIds = ref<string[]>([])

  function openUrgeDialog(): void {
    if (acting.value || !canUrge.value) return
    urgeMessage.value = ''
    urgeRecipientIds.value = []
    urgeDialogVisible.value = true
  }

  async function confirmUrge(): Promise<void> {
    await onUrge(urgeMessage.value.trim(), urgeRecipientIds.value)
    urgeDialogVisible.value = false
  }

  async function onUrge(message?: string, recipientIds?: string[]): Promise<void> {
    const d = detail.value
    if (!d?.processInstanceId || !canUrge.value) return
    try {
      // 实例记录标识优先取任务详情（参与人可用）；旧响应缺省时回退发起人实例列表
      let instanceRecordId: number | string | null = d.instanceId ?? null
      if (instanceRecordId == null) {
        const page = await myInstances(
          { pageNum: 1, pageSize: 100 },
          d.businessKey ? { keyword: d.businessKey } : undefined,
        )
        const instance = page.list.find(
          (item) =>
            item.processInstanceId === d.processInstanceId &&
            String(item.initiatorId) === String(d.initiatorId),
        )
        if (!instance) {
          ElMessage.info(t('workflow.urgeNotAvailable'))
          return
        }
        instanceRecordId = instance.id
      }
      const { urgeMyInstance } = await import('@/modules/workflow/api/oa')
      const resp = await urgeMyInstance(
        instanceRecordId,
        message,
        recipientIds && recipientIds.length > 0 ? recipientIds : undefined,
      )
      if (resp.result === 'ACCEPTED') {
        ElMessage.success(resp.detail || t('workflow.urgeSent'))
      } else if (resp.result === 'COOLDOWN') {
        ElMessage.warning(resp.detail || t('workflow.urgeCoolingDown'))
      } else {
        ElMessage.info(resp.detail || t('workflow.urgeNotAvailable'))
      }
    } catch (err) {
      ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.urgeFailed'))
    }
  }

  return {
    canUrge,
    urgeDialogVisible,
    urgeMessage,
    urgeRecipientOptions,
    urgeRecipientIds,
    openUrgeDialog,
    confirmUrge,
  }
}
