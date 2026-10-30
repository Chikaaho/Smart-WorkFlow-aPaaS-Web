import type { BpmNodeCapability } from '@/contracts/bpm-node'

/**
 * 设计器节点面板的纯展示层共享模块（Q56：表单工作台零关联流程分支复用同一节点库）。
 *
 * 抽取自 ProcessDesigner.vue：图标字形、分组定义与「能力契约 → 面板分组」投影。
 * 仅做展示投影，不承载任何画布编辑状态；未来新增但尚未归类的节点保留在
 * 「自动处理」末尾，避免因视觉分组隐藏合法能力（与设计器同一口径）。
 */

/** 节点图标字形（20×20 坐标系，画布与选择器同源）。 */
export const NODE_ICON_PATHS: Record<string, readonly string[]> = {
  START: ['M6.667 3.333L16.667 10L6.667 16.667V3.333Z'],
  DRAFT: [
    'M11.667 2.5H3.333V17.5H16.667V7.5H11.667V2.5ZM9.167 13.333L15.833 6.667L17.5 8.333L10.833 15L8.333 15.833L9.167 13.333Z',
  ],
  APPROVAL: [
    'M17.5 11.667C18.881 11.667 20 10.547 20 9.167C20 7.786 18.881 6.667 17.5 6.667C16.119 6.667 15 7.786 15 9.167C15 10.547 16.119 11.667 17.5 11.667Z',
    'M10.833 18.333C10.833 17.228 11.272 16.168 12.054 15.387C12.835 14.606 13.895 14.167 15 14.167C16.105 14.167 17.165 14.606 17.946 15.387C18.728 16.168 19.167 17.228 19.167 18.333',
  ],
  CONSENSUS: [
    'M12.5 9.167C14.341 9.167 15.833 7.674 15.833 5.833C15.833 3.992 14.341 2.5 12.5 2.5C10.659 2.5 9.167 3.992 9.167 5.833C9.167 7.674 10.659 9.167 12.5 9.167Z',
    'M3.333 17.5C3.333 15.732 4.036 14.036 5.286 12.786C6.536 11.536 8.232 10.833 10 10.833C11.768 10.833 13.464 11.536 14.714 12.786C15.964 14.036 16.667 15.732 16.667 17.5',
  ],

  CONDITION: ['M12 1.667L20.333 10L12 18.333L3.667 10L12 1.667Z'],
  PARALLEL_GATEWAY: [
    'M10 1.667L18.333 10L10 18.333L1.667 10L10 1.667Z',
    'M10 6.667V13.333M6.667 10H13.333',
  ],
  NOTIFICATION: ['M11.667 1.667H4.167V18.333H15.833V5.833L11.667 1.667V1.667Z'],
  IOT_COMMAND: [
    'M13.333 5H6.667C5.746 5 5 5.746 5 6.667V13.333C5 14.254 5.746 15 6.667 15H13.333C14.254 15 15 14.254 15 13.333V6.667C15 5.746 14.254 5 13.333 5Z',
    'M7.5 1.667V5M12.5 1.667V5M7.5 15V18.333M12.5 15V18.333M1.667 7.5H5M1.667 12.5H5M15 7.5H18.333M15 12.5H18.333',
  ],
  AGENT: [
    'M15 4.167H5C3.619 4.167 2.5 5.286 2.5 6.667V14.167C2.5 15.547 3.619 16.667 5 16.667H15C16.381 16.667 17.5 15.547 17.5 14.167V6.667C17.5 5.286 16.381 4.167 15 4.167Z',
    'M10 1.667V4.167M6.667 8.333H6.75M13.333 8.333H13.417M6.667 12.5H13.333',
  ],
  DEFAULT: [
    'M15 3.333H5C4.079 3.333 3.333 4.08 3.333 5V15.833C3.333 16.754 4.079 17.5 5 17.5H15C15.92 17.5 16.667 16.754 16.667 15.833V5C16.667 4.08 15.92 3.333 15 3.333Z',
    'M6.667 10L9.167 12.5L13.333 7.5M7.5 1.667H12.5V5H7.5V1.667Z',
  ],
}

export function nodeIconPaths(type: string): readonly string[] {
  return NODE_ICON_PATHS[type] ?? NODE_ICON_PATHS.DEFAULT!
}

/** 节点面板分组（能力契约 category → 面板分组标题）。 */
export const PALETTE_GROUP_TYPES: ReadonlyArray<{
  key: string
  labelKey: string
  types: readonly string[]
}> = [
  {
    key: 'event-control',
    labelKey: 'workflow.paletteEventControl',
    types: ['START', 'END', 'CONDITION', 'PARALLEL_GATEWAY'],
  },
  {
    key: 'human',
    labelKey: 'workflow.paletteHuman',
    types: ['DRAFT', 'APPROVAL', 'CONSENSUS', 'DYNAMIC_PARALLEL'],
  },
  {
    key: 'automatic',
    labelKey: 'workflow.paletteAutomatic',
    types: ['COPY', 'NOTIFICATION', 'TXN_ACTION', 'IOT_COMMAND', 'AGENT'],
  },
]

export interface PaletteGroup {
  category: string
  label: string
  items: BpmNodeCapability[]
}

/**
 * 能力契约 → 面板分组的纯函数投影（节点仍由服务端能力契约决定，前端仅按设计稿分组与排序）。
 * `labelOf` 把分组 labelKey 翻译成展示文案（调用方决定 i18n 来源）。
 */
export function groupPaletteCapabilities(
  capabilities: readonly BpmNodeCapability[],
  labelOf: (labelKey: string) => string,
): PaletteGroup[] {
  const byType = new Map(capabilities.map((capability) => [capability.type, capability]))
  const groupedTypes = new Set<string>()
  const groups = PALETTE_GROUP_TYPES.map((group) => {
    const items = group.types
      .map((type) => byType.get(type))
      .filter((capability): capability is BpmNodeCapability => {
        if (!capability) return false
        groupedTypes.add(capability.type)
        return true
      })
    return { category: group.key, label: labelOf(group.labelKey), items }
  })
  const remaining = capabilities.filter((capability) => !groupedTypes.has(capability.type))
  if (remaining.length > 0) {
    const automatic = groups.find((group) => group.category === 'automatic')
    automatic?.items.push(...remaining)
  }
  return groups.filter((group) => group.items.length > 0)
}
