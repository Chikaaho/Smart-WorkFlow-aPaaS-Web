import { describe, expect, it } from 'vitest'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { projectAdminSections } from './admin-sections'

const page = (path: string): MenuNode => ({
  id: path,
  parentId: null,
  name: path,
  title: path,
  path,
  component: 'authorized/component',
  menuType: MenuType.MENU,
  sort: 1,
})
describe('admin section projection', () => {
  it('groups authorized pages consistently and preserves unknown extension entries', () => {
    const nodes = [
      page('system/user'),
      page('openapi'),
      page('form/form-def-list'),
      page('form/app-manage'),
      page('extension/page'),
    ]
    const result = projectAdminSections(nodes, (key) => key)
    expect(result.slice(0, 3).map((node) => node.title)).toEqual([
      'menu.system',
      'form.appCenter.manageTitle',
      'form.managementTitle',
    ])
    expect(result[0]?.children?.map((node) => node.id)).toEqual(['system/user', 'openapi'])
    expect(result.at(-1)).toBe(nodes.at(-1))
    expect(nodes.map((node) => node.parentId)).toEqual([null, null, null, null, null])
  })
  it('does not synthesize application or tenant access when no such page is authorized', () => {
    const result = projectAdminSections([page('system/dict')], (key) => key)
    expect(result).toHaveLength(1)
    expect(result[0]?.children?.map((node) => node.path)).toEqual(['system/dict'])
    expect(projectAdminSections([], (key) => key)).toEqual([])
  })
})
