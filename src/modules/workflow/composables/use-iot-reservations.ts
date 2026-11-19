import { ref } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import type { TaskDetail } from '@/contracts/bpm'
import type { IotReservationView } from '@/adapters/iot-reservation'

/**
 * P63 IoT 预约信息（实例维度；跨模块沿用动态 import，失败不阻断审批主链）。
 * TaskDetail 页拆分：查询与取消动作在此，展示状态映射在 TaskIotReservationCard。
 */
export function useIotReservations(detail: Ref<TaskDetail | null>) {
  const reservations = ref<IotReservationView[]>([])
  const reservationsLoading = ref(false)

  /** 实例维度查询一次；失败/为空时区块整体隐藏，普通审批场景零打扰。 */
  async function loadReservations() {
    const processInstanceId = detail.value?.processInstanceId
    if (!processInstanceId) return
    reservationsLoading.value = true
    try {
      const { listReservationsByInstance } = await import('@/adapters/iot-reservation')
      reservations.value = (await listReservationsByInstance(processInstanceId)) ?? []
    } catch {
      // 查询失败按无预约处理（区块隐藏），不打断审批详情主链
      reservations.value = []
    } finally {
      reservationsLoading.value = false
    }
  }

  // ─── 取消预约：入口按 v-perm（iot:reservation:cancel）显隐，服务端仍是最终权威 ───
  const cancelDialogVisible = ref(false)
  const cancelTarget = ref<IotReservationView | null>(null)
  const cancelReason = ref('')
  const cancelSubmitting = ref(false)

  function openCancelReservation(row: IotReservationView) {
    cancelTarget.value = row
    cancelReason.value = ''
    cancelDialogVisible.value = true
  }

  async function submitCancelReservation() {
    const target = cancelTarget.value
    if (!target) return
    if (!cancelReason.value.trim()) {
      ElMessage.warning('请填写取消原因')
      return
    }
    cancelSubmitting.value = true
    try {
      const { cancelReservation } = await import('@/adapters/iot-reservation')
      const outcome = await cancelReservation(target.id, cancelReason.value.trim())
      if (outcome === 'CANCELED') {
        ElMessage.success('预约已取消')
        cancelDialogVisible.value = false
      } else {
        // 幂等不可取消（已被触发/已取消/已过期等）：提示后刷新到最新状态
        ElMessage.warning('当前预约状态不可取消')
      }
      await loadReservations()
    } catch (err) {
      ElMessage.error(err instanceof ApiError ? err.msg : '取消预约失败')
    } finally {
      cancelSubmitting.value = false
    }
  }

  return {
    reservations,
    reservationsLoading,
    loadReservations,
    cancelDialogVisible,
    cancelReason,
    cancelSubmitting,
    openCancelReservation,
    submitCancelReservation,
  }
}
