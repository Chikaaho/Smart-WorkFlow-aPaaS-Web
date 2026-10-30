import { MenuType, type MenuNode } from '@/contracts/menu'

const SECTIONS = [
  { key: 'system', label: 'menu.system', matches: /^(system|storage|job|openapi)(\/|$)/ },
  { key: 'applications', label: 'form.appCenter.manageTitle', matches: /^form\/app-manage(\/|$)/ },
  { key: 'forms', label: 'form.managementTitle', matches: /^form(\/|$)/ },
  { key: 'workflow', label: 'nav.adminWorkflow', matches: /^workflow(\/|$)/ },
  { key: 'notify', label: 'menu.notify', matches: /^notify(\/|$)/ },
  { key: 'agent', label: 'menu.agent', matches: /^agent(\/|$)/ },
  { key: 'iot', label: 'menu.iot', matches: /^iot(\/|$)/ },
]

/** 只重排已授权菜单的展示投影；原始 id、路径、权限和未知扩展入口全部保留。 */
export function projectAdminSections(
  nodes: MenuNode[],
  translate: (key: string) => string,
): MenuNode[] {
  const groups = new Map<string, MenuNode[]>()
  const extras: MenuNode[] = []
  for (const node of nodes) {
    const section = SECTIONS.find((item) => item.matches.test(node.path.replace(/^\//, '')))
    if (!section) {
      extras.push(node)
      continue
    }
    const children =
      node.menuType === MenuType.DIRECTORY && node.children?.length ? node.children : [node]
    groups.set(section.key, [...(groups.get(section.key) ?? []), ...children])
  }
  const result: MenuNode[] = []
  for (const section of SECTIONS) {
    const children = groups.get(section.key)
    if (!children?.length) continue
    if (section.key === 'system') {
      const order = [
        'system/tenant',
        'system/user',
        'system/dept',
        'system/role',
        'system/menu',
        'system/dict',
        'system/post',
        'system/user-group',
      ]
      const rank = (node: MenuNode) => {
        const index = order.indexOf(node.path.replace(/^\//, ''))
        return index < 0 ? order.length : index
      }
      children.sort((a, b) => rank(a) - rank(b))
    }
    result.push({
      id: `admin-section:${section.key}`,
      parentId: null,
      name: `admin-section:${section.key}`,
      title: translate(section.label),
      path: `__section/${section.key}`,
      component: null,
      sort: result.length,
      menuType: MenuType.DIRECTORY,
      children,
    })
  }
  return [...result, ...extras]
}
