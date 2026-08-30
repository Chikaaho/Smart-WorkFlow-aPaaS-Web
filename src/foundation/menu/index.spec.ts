import { describe, it, expect, vi, afterEach } from 'vitest'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { MOCK_MENU_TREE } from '@/foundation/mock/seeds'
import { buildRoutesFromMenu, findFirstLeafPath } from './index'

const mockMenu = MOCK_MENU_TREE as MenuNode[]

describe('foundation/menu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves real on-disk components for every MENU-type route (directory redirects have no component)', async () => {
    const routes = buildRoutesFromMenu(mockMenu)
    expect(routes.length).toBeGreaterThan(0)
    const menuRoutes = routes.filter((r) => r.component)
    expect(menuRoutes.length).toBeGreaterThan(0)
    expect(menuRoutes.every((route) => typeof route.component === 'function')).toBe(true)
  })

  it('mock menu tree carries at least one two-level nesting (directory + children)', () => {
    const directory = mockMenu.find((node) => node.menuType === MenuType.DIRECTORY)
    expect(directory).toBeDefined()
    expect(directory!.children?.length).toBeGreaterThan(0)
  })

  // ── 目录 redirect 到首叶（新契约） ──────────────────────────

  it('creates redirect routes for directory nodes pointing to first leaf child', () => {
    const routes = buildRoutesFromMenu(mockMenu)
    const paths = routes.map((r) => r.path)

    // 目录路径现在有路由（redirect）
    expect(paths).toContain('system')

    // 叶子路径仍在
    expect(paths).toContain('system/dict')

    // 验证目录 redirect 指向首叶
    const systemRoute = routes.find((r) => r.path === 'system')
    expect(systemRoute).toBeDefined()
    expect(systemRoute!.redirect).toBe('system/dict')
    expect(systemRoute!.component).toBeUndefined()
  })

  it('directory redirect respects sort order: lower sort number = first leaf', () => {
    const routes = buildRoutesFromMenu([
      {
        id: 'd',
        parentId: null,
        name: 'd',
        title: 'd',
        path: 'testdir',
        component: null,
        sort: 1,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: 'a',
            parentId: 'd',
            name: 'second',
            title: 'second',
            path: 'testdir/second',
            component: 'system/views/DictTypeList',
            sort: 2,
            menuType: MenuType.MENU,
          },
          {
            id: 'b',
            parentId: 'd',
            name: 'first',
            title: 'first',
            path: 'testdir/first',
            component: 'system/views/DictTypeList',
            sort: 1,
            menuType: MenuType.MENU,
          },
        ],
      },
    ])
    const dirRoute = routes.find((r) => r.path === 'testdir')
    expect(dirRoute).toBeDefined()
    // sort=1 的 first 应在 sort=2 的 second 之前
    expect(dirRoute!.redirect).toBe('testdir/first')
  })

  it('nested directories: redirect chains through to the deepest first leaf', () => {
    const routes = buildRoutesFromMenu([
      {
        id: 'a',
        parentId: null,
        name: 'a',
        title: 'a',
        path: 'a',
        component: null,
        sort: 1,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: 'b',
            parentId: 'a',
            name: 'b',
            title: 'b',
            path: 'a/b',
            component: null,
            sort: 1,
            menuType: MenuType.DIRECTORY,
            children: [
              {
                id: 'c',
                parentId: 'b',
                name: 'c',
                title: 'c',
                path: 'a/b/c',
                component: 'system/views/DictTypeList',
                sort: 1,
                menuType: MenuType.MENU,
              },
            ],
          },
        ],
      },
    ])
    // 外层目录 redirect 穿透内层目录到叶子
    const aRoute = routes.find((r) => r.path === 'a')
    expect(aRoute).toBeDefined()
    expect(aRoute!.redirect).toBe('a/b/c')

    // 内层目录也有 redirect
    const bRoute = routes.find((r) => r.path === 'a/b')
    expect(bRoute).toBeDefined()
    expect(bRoute!.redirect).toBe('a/b/c')

    // 叶子路由存在
    const leaf = routes.find((r) => r.path === 'a/b/c')
    expect(leaf).toBeDefined()
    expect(leaf!.component).toBeDefined()
  })

  it('leaf with unresolvable component: component skipped with warning, redirect still created from directory', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routes = buildRoutesFromMenu([
      {
        id: 'd',
        parentId: null,
        name: 'empty',
        title: 'empty',
        path: 'empty-dir',
        component: null,
        sort: 1,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: 'u',
            parentId: 'd',
            name: 'unknown',
            title: 'unknown',
            path: 'empty-dir/unknown',
            component: 'nope/DoesNotExist',
            sort: 1,
            menuType: MenuType.MENU,
          },
        ],
      },
    ])
    // component 字段有值 → findFirstLeafPath 视其为可落地 → 目录 redirect 创建
    const dirRoute = routes.find((r) => r.path === 'empty-dir')
    expect(dirRoute).toBeDefined()
    expect(dirRoute!.redirect).toBe('empty-dir/unknown')
    // 但子节点 component 解析失败 → MENU route 被跳过并 warn
    const menuRoute = routes.find((r) => r.path === 'empty-dir/unknown' && r.component)
    expect(menuRoute).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('empty directory (no children): no route at all', () => {
    const routes = buildRoutesFromMenu([
      {
        id: 'd',
        parentId: null,
        name: 'e',
        title: 'e',
        path: 'empty-dir',
        component: null,
        sort: 1,
        menuType: MenuType.DIRECTORY,
        children: [],
      },
    ])
    expect(routes).toHaveLength(0)
  })

  // ── findFirstLeafPath 单元测试 ──────────────────────────────

  it('findFirstLeafPath: returns first MENU node with component (by sort order)', () => {
    const leaf = findFirstLeafPath([
      {
        id: '1',
        parentId: null,
        name: 'second',
        title: 'second',
        path: 'b',
        component: 'system/views/DictTypeList',
        sort: 2,
        menuType: MenuType.MENU,
      },
      {
        id: '2',
        parentId: null,
        name: 'first',
        title: 'first',
        path: 'a',
        component: 'system/views/DictTypeList',
        sort: 1,
        menuType: MenuType.MENU,
      },
    ])
    expect(leaf).toBe('a')
  })

  it('findFirstLeafPath: DFS into nested directories', () => {
    const leaf = findFirstLeafPath([
      {
        id: 'd',
        parentId: null,
        name: 'd',
        title: 'd',
        path: 'd',
        component: null,
        sort: 1,
        menuType: MenuType.DIRECTORY,
        children: [
          {
            id: 'inner',
            parentId: 'd',
            name: 'inner',
            title: 'inner',
            path: 'd/inner',
            component: 'system/views/DictTypeList',
            sort: 1,
            menuType: MenuType.MENU,
          },
        ],
      },
    ])
    expect(leaf).toBe('d/inner')
  })

  it('findFirstLeafPath: returns undefined when no leaf exists', () => {
    expect(findFirstLeafPath([])).toBeUndefined()
    expect(
      findFirstLeafPath([
        {
          id: 'b',
          parentId: null,
          name: 'btn',
          title: 'btn',
          path: 'btn',
          component: null,
          sort: 1,
          menuType: MenuType.BUTTON,
        },
      ]),
    ).toBeUndefined()
  })

  it('findFirstLeafPath: skips MENU nodes without component', () => {
    const leaf = findFirstLeafPath([
      {
        id: 'a',
        parentId: null,
        name: 'no-comp',
        title: 'no-comp',
        path: 'a',
        component: null, // MENU 但没有 component → 不算可落地
        sort: 1,
        menuType: MenuType.MENU,
      },
      {
        id: 'b',
        parentId: null,
        name: 'has-comp',
        title: 'has-comp',
        path: 'b',
        component: 'system/views/DictTypeList',
        sort: 2,
        menuType: MenuType.MENU,
      },
    ])
    expect(leaf).toBe('b')
  })

  // ── 保留的既有测试 ──────────────────────────────────────────

  it('skips button-type nodes and unresolved component paths, warning instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const routes = buildRoutesFromMenu([
      {
        id: 'b',
        parentId: null,
        name: 'btn',
        title: 'button',
        path: 'btn',
        component: null,
        sort: 1,
        menuType: MenuType.BUTTON,
      },
      {
        id: 'u',
        parentId: null,
        name: 'unknown',
        title: 'unknown',
        path: 'unknown',
        component: 'nope/views/DoesNotExist',
        sort: 2,
        menuType: MenuType.MENU,
      },
    ])
    expect(routes).toHaveLength(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
