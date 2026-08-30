import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { request } from '@/foundation/request'

// ─── 后端响应 DTO ──────────────────────────────────────────

/** GET /system/auth/menus 返回的节点形状（与 MenuNode 一致，独立类型用于防腐层隔离）。 */
interface MenuNodeDTO {
  id: string
  parentId: string | null
  name: string
  title: string
  path: string
  component: string | null
  icon?: string
  sort: number
  menuType: number
  permission?: string
  hidden?: boolean
  children?: MenuNodeDTO[]
}

// ─── Adapter ────────────────────────────────────────────────

function mapMenuNode(dto: MenuNodeDTO): MenuNode {
  return {
    id: dto.id,
    parentId: dto.parentId,
    name: dto.name,
    title: dto.title,
    path: dto.path,
    component: dto.component,
    icon: dto.icon,
    sort: dto.sort,
    menuType: dto.menuType as MenuType,
    permission: dto.permission,
    hidden: dto.hidden,
    children: dto.children?.map(mapMenuNode),
  }
}

/**
 * 后端菜单 DTO 数组 → 前端 MenuNode[] 契约映射。
 * 递归处理 children 嵌套。
 */
function mapMenuNodes(dtos: MenuNodeDTO[]): MenuNode[] {
  return dtos.map(mapMenuNode)
}

// ─── 公开 API ──────────────────────────────────────────────

/**
 * 加载当前用户的菜单树。
 * - pnpm dev:mock 模式：请求被 mock 调度器拦截，返回假数据；
 * - pnpm dev/prod 模式：请求穿透到后端 GET /system/auth/menus 真端点。
 */
export async function loadMenu(): Promise<MenuNode[]> {
  const dtos = await request<MenuNodeDTO[]>({
    method: 'GET',
    url: '/system/auth/menus',
  })
  return mapMenuNodes(dtos)
}

/**
 * 组件白名单：只允许加载 src/modules/** 下的 .vue 文件，禁止用字符串拼接 import() 任意模块。
 * 菜单节点的 component 字段（如 "system/views/SystemHome"）经此白名单解析，解析不到则跳过并告警。
 */
const componentWhitelist = import.meta.glob<{ default: Component }>('/src/modules/**/*.vue')

function resolveComponent(componentPath: string) {
  return componentWhitelist[`/src/modules/${componentPath}.vue`]
}

/**
 * DFS 查找菜单子树中第一个可落地叶子（menuType=1 且 component 非空）的完整 path。
 * 按 sort 升序遍历，保证与菜单显示顺序一致。用于目录 redirect 与默认落地解析。
 */
export function findFirstLeafPath(nodes: MenuNode[]): string | undefined {
  const sorted = [...nodes].sort((a, b) => a.sort - b.sort)
  for (const node of sorted) {
    if (node.menuType === MenuType.MENU && node.component) {
      return node.path
    }
    if (node.children?.length) {
      const found = findFirstLeafPath(node.children)
      if (found) return found
    }
  }
  return undefined
}

function buildRoutesFromNodes(nodes: MenuNode[]): RouteRecordRaw[] {
  const routes: RouteRecordRaw[] = []

  for (const node of nodes) {
    if (node.menuType === MenuType.BUTTON) {
      continue
    }

    if (node.menuType === MenuType.DIRECTORY) {
      if (node.children?.length) {
        // 目录节点注册 redirect 路由，指向第一个可落地叶子后代（DFS 首叶）。
        // 点目录 / 落地到目录路径都弹首叶，不再 404。
        const firstLeaf = findFirstLeafPath(node.children)
        if (firstLeaf) {
          routes.push({
            path: node.path,
            redirect: firstLeaf,
            meta: { title: node.title, icon: node.icon, permission: node.permission },
          })
        }
        routes.push(...buildRoutesFromNodes(node.children))
      }
      continue
    }

    const loader = node.component ? resolveComponent(node.component) : undefined
    if (!loader) {
      console.warn(`[menu] unknown component path, skip route: ${node.path} -> ${node.component}`)
      continue
    }

    const children = node.children?.length ? buildRoutesFromNodes(node.children) : undefined

    routes.push({
      path: node.path,
      name: node.name,
      component: loader,
      meta: { title: node.title, icon: node.icon, permission: node.permission },
      ...(children ? { children } : {}),
    })
  }

  return routes
}

export function buildRoutesFromMenu(nodes: MenuNode[]): RouteRecordRaw[] {
  return buildRoutesFromNodes(nodes)
}
