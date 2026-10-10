/**
 * P64 阶段Ⅱ（A07）岗位委托管理 API（后台组织域通用配置）。
 * 与后端 /system/post-delegate 控制器对齐。
 */
import { request } from '@/foundation/request'
import type { PageResult } from '@/contracts/common'
import type { PostDelegateRow } from '@/contracts/p64'

/** POST /system/post-delegate/page → 分页查询委托关系 */
export async function pagePostDelegates(
  pageNum: number,
  pageSize: number,
  filter?: Partial<Pick<PostDelegateRow, 'sourcePostId' | 'targetPostId' | 'scopeType' | 'status'>>,
): Promise<PageResult<PostDelegateRow>> {
  return request<PageResult<PostDelegateRow>>({
    method: 'POST',
    url: `/system/post-delegate/page?pageNum=${pageNum}&pageSize=${pageSize}`,
    data: filter ?? {},
  })
}

/** POST /system/post-delegate → 创建（自委托/循环/跨租户/越权/同优先级重叠配置拒绝） */
export async function createPostDelegate(
  row: Omit<PostDelegateRow, 'id' | 'createTime'>,
): Promise<number> {
  return request<number>({ method: 'POST', url: '/system/post-delegate', data: row })
}

/** PUT /system/post-delegate → 更新（全量校验 + 生效链校验） */
export async function updatePostDelegate(row: PostDelegateRow): Promise<void> {
  await request<void>({ method: 'PUT', url: '/system/post-delegate', data: row })
}

/** PUT /system/post-delegate/{id}/status → 启停（启用时重新执行重叠与循环校验） */
export async function changePostDelegateStatus(
  id: number | string,
  status: 'ENABLED' | 'DISABLED',
): Promise<void> {
  await request<void>({ method: 'PUT', url: `/system/post-delegate/${id}/status?status=${status}` })
}

/** DELETE /system/post-delegate/{id} → 删除（逻辑删除） */
export async function deletePostDelegate(id: number | string): Promise<void> {
  await request<void>({ method: 'DELETE', url: `/system/post-delegate/${id}` })
}
