/**
 * IoT 预约接缝（P63）：workflow 详情页对预约查询/取消的唯一跨模块出口。
 *
 * modules 间禁止横向 import（ESLint import/no-restricted-paths 强制）；跨模块交互
 * 经本 adapter 薄接缝收敛——动态 import 保持懒加载（失败不阻断审批主链），
 * 视图类型经类型查询导出（不建立运行时依赖）。后续若沉淀正式 facade，仅换本文件数据源。
 */
import type { IotReservationCancelOutcome, IotReservationView } from '@/modules/iot/api'

export type { IotReservationCancelOutcome, IotReservationView }

/** 按流程实例回查预约列表（失败由调用方按无预约处理）。 */
export async function listReservationsByInstance(
  processInstanceId: string,
): Promise<IotReservationView[]> {
  const { listReservationsByInstance: list } = await import('@/modules/iot/api')
  return list(processInstanceId)
}

/** 取消待触发预约；结果: CANCELED / NOT_CANCELLABLE（服务端权威裁决，适配层解包响应壳）。 */
export async function cancelReservation(
  id: number,
  reason: string,
): Promise<IotReservationCancelOutcome> {
  const { cancelReservation: cancel } = await import('@/modules/iot/api')
  return (await cancel(id, reason)).outcome
}
