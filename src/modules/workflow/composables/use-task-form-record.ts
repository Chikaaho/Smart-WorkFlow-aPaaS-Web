import { ref } from 'vue'
import type { Ref } from 'vue'
import type { TaskDetail } from '@/contracts/bpm'

/**
 * 本次提交的表单记录回查（TaskDetail 页拆分）。
 *
 * businessKey = 表单记录 ID，经 form 模块只读接口回查；失败不阻断审批主链。
 */
export function useTaskFormRecord(detail: Ref<TaskDetail | null>) {
  /** 本次提交的表单记录数据（businessKey = 表单记录 ID，经 form 模块只读接口回查） */
  const formRecord = ref<Record<string, unknown> | null>(null)
  const formRecordLoading = ref(false)

  /** 按 formKey + businessKey 回查本次提交的表单数据；失败不阻断审批主链 */
  async function loadFormRecord() {
    const d = detail.value
    if (!d?.formKey || !d.businessKey) return
    formRecordLoading.value = true
    try {
      const { getFormData } = await import('@/adapters/form-runtime')
      formRecord.value = await getFormData(d.formKey, d.businessKey)
    } catch {
      // 程序化发起实例（Agent/IoT/API）没有表单记录：回退引擎变量中的 formData 快照
      const raw = d.processVariables?.formData
      formRecord.value =
        raw && typeof raw === 'object' && !Array.isArray(raw) && Object.keys(raw).length > 0
          ? (raw as Record<string, unknown>)
          : null
    } finally {
      formRecordLoading.value = false
    }
  }

  return { formRecord, formRecordLoading, loadFormRecord }
}
