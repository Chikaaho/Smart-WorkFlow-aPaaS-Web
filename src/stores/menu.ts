import { defineStore } from 'pinia'
import type { MenuNode } from '@/contracts/menu'

/**
 * 菜单「单一数据源」的运行时落点（决策文档 · 外壳刀 §4）。
 * router/guard 在会话确立时调用 loadMenu() 一次，既喂给 buildRoutesFromMenu() 建路由，
 * 又 setMenu() 存入此 store 供侧边栏/面包屑渲染——一份数据、两个消费者，侧边栏绝不二次拉取。
 */
export const useMenuStore = defineStore('menu', {
  state: () => ({
    menu: [] as MenuNode[],
  }),
  actions: {
    setMenu(menu: MenuNode[]): void {
      this.menu = menu
    },
    clearMenu(): void {
      this.menu = []
    },
  },
})
