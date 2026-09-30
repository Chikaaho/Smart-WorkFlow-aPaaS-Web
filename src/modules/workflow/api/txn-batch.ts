import { request } from '@/foundation/request'

/**
 * 后台批量受控动作调用 API（P62 分级执行 S3/S5）。
 *
 * 全部走 foundation/request，禁直引 axios。
 * 受理为异步语义：受理成功仅代表批次已持久化并入队，结果按批次键回查；
 * 批次重放（同批次键再次受理）返回原批次（replay=true），不重复执行。
 */

/** 批次状态。 */
export type TxnBatchStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_FAILED'
/** 批次项状态。 */
export type TxnBatchItemStatus = 'PENDING' | 'SUCCEEDED' | 'REJECTED'

/** 批次项受理/结果行。 */
export interface TxnBatchItemView {
  itemKey: string
  recordId: string | null
  quantity: string | null
  status: TxnBatchItemStatus
  invocationId: string | null
  errorCode: number | null
  errorMsg: string | null
  attemptCount: number | null
}

/** 批次视图（受理返回与回查共用）。 */
export interface TxnBatchView {
  batchKey: string
  actionId: string
  actionVersion: number | null
  status: TxnBatchStatus
  totalCount: number | null
  succeededCount: number | null
  failedCount: number | null
  commandId: number | null
  /** 同批次键重放命中原批次时为 true（未重建、未重复执行）。 */
  replay: boolean
  items: TxnBatchItemView[] | null
}

/** 批量受理请求。 */
export interface TxnBatchSubmitReq {
  batchKey: string
  actionId: string
  items: TxnBatchItemReq[]
}

/** 批量项请求。 */
export interface TxnBatchItemReq {
  itemKey: string
  recordId: string
  quantity: string
}

/** 受理批量调用（同租户批次键幂等：重放返回原批次）。 */
export function submitTxnBatch(body: TxnBatchSubmitReq): Promise<TxnBatchView> {
  return request<TxnBatchView>({ url: '/workflow/txn-batch', method: 'post', data: body })
}

/** 批次回查：批次状态 + 逐项结果（U07 批量项独立追踪）。 */
export function getTxnBatch(batchKey: string): Promise<TxnBatchView> {
  return request<TxnBatchView>({
    url: `/workflow/txn-batch/${encodeURIComponent(batchKey)}`,
    method: 'get',
  })
}
