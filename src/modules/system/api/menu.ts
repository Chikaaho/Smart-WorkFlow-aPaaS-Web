import { request } from '@/foundation/request'

/** 菜单管理条目（V012-BUG-011/017）：仅目录/菜单，不含按钮。 */
export interface MenuManageItem {
  id: string
  parentId: string | null
  name: string
  title: string
  path: string
  icon: string | null
  sort: number | null
  hidden: boolean | null
  menuType: number
}

/** GET /system/menu/manage-items */
export async function listMenuItems(): Promise<MenuManageItem[]> {
  return request<MenuManageItem[]>({ method: 'GET', url: '/system/menu/manage-items' })
}

/** PUT /system/menu/{id}：title/icon/sort/hidden 受控更新（字段可缺省）。 */
export async function updateMenuItem(
  id: string,
  cmd: { title?: string; icon?: string | null; sort?: number; hidden?: boolean },
): Promise<void> {
  const body: Record<string, unknown> = {}
  if (cmd.title !== undefined) body.title = cmd.title
  if (cmd.icon !== undefined) body.icon = cmd.icon
  if (cmd.sort !== undefined) body.sort = cmd.sort
  if (cmd.hidden !== undefined) body.hidden = cmd.hidden
  return request<void>({ method: 'PUT', url: `/system/menu/${id}`, data: body })
}
