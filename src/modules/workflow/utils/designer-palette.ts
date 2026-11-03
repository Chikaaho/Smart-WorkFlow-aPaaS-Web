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
  // 审批：单人头像居中（头 + 肩），对齐参考 UI——旧字形头像画在右上角，视觉上「头是歪的」
  APPROVAL: [
    'M10 3.3C11.73 3.3 13.13 4.7 13.13 6.43C13.13 8.16 11.73 9.57 10 9.57C8.27 9.57 6.87 8.16 6.87 6.43C6.87 4.7 8.27 3.3 10 3.3Z',
    'M3.75 17.5C3.75 14.04 6.55 11.25 10 11.25C13.45 11.25 16.25 14.04 16.25 17.5',
  ],
  // 会签：双人头像（前后错位但各自头身同轴）
  CONSENSUS: [
    'M7.2 3C8.64 3 9.8 4.16 9.8 5.6C9.8 7.04 8.64 8.2 7.2 8.2C5.76 8.2 4.6 7.04 4.6 5.6C4.6 4.16 5.76 3 7.2 3Z',
    'M1.9 17.5C1.9 14.57 4.27 12.2 7.2 12.2C10.13 12.2 12.5 14.57 12.5 17.5',
    'M14.2 4.9C15.3 4.9 16.2 5.8 16.2 6.9C16.2 8 15.3 8.9 14.2 8.9C13.1 8.9 12.2 8 12.2 6.9C12.2 5.8 13.1 4.9 14.2 4.9Z',
    'M12.6 12.4C15.4 12.6 17.7 14.8 17.7 17.5',
  ],
  // 抄送：纸飞机（旧字形落到 DEFAULT 文档，参考 UI 为纸飞机）
  COPY: ['M17.9 2.1L2.4 9.2L8.7 11.5L17.9 2.1Z', 'M17.9 2.1L11.2 17.6L8.7 11.5L17.9 2.1Z'],

  CONDITION: ['M12 1.667L20.333 10L12 18.333L3.667 10L12 1.667Z'],
  PARALLEL_GATEWAY: [
    'M10 1.667L18.333 10L10 18.333L1.667 10L10 1.667Z',
    'M10 6.667V13.333M6.667 10H13.333',
  ],
  // 通知：铃铛（旧字形是文档轮廓）
  NOTIFICATION: [
    'M10 2.5C7.65 2.5 5.75 4.4 5.75 6.75V10.4L4.1 13.9H15.9L14.25 10.4V6.75C14.25 4.4 12.35 2.5 10 2.5Z',
    'M8.4 15.8H11.6C11.6 16.68 10.88 17.4 10 17.4C9.12 17.4 8.4 16.68 8.4 15.8Z',
  ],
  // 动态并行：双行并行箭头（旧字形落到 DEFAULT 文档）
  DYNAMIC_PARALLEL: [
    'M3.3 6.7H13.3M10.8 4.2L13.3 6.7L10.8 9.2',
    'M6.7 13.3H16.7M14.2 10.8L16.7 13.3L14.2 15.8',
  ],
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
