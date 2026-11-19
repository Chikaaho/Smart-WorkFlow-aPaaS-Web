import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from '@/locales'
import { queryCatalogItems, type CatalogItem } from '@/modules/workflow/api/oa'
import type {
  WorkspaceCard,
  WorkspaceCardType,
  WorkspaceComponent,
  WorkspaceLayoutResp,
} from '@/contracts/catalog'
import { rendererKeyFor } from '@/modules/workflow/utils/workspace-components'
import type { WorkspaceDataConfig } from '@/modules/workflow/utils/workspace-data'

/** 组件库新增/重新启用卡片等编辑操作的“脏”标记由宿主持有。 */
export interface WorkspaceConfigDeps {
  dirty: Ref<boolean>
}

/**
 * 工作台布局配置核心状态：组件清单/卡片类型/常用事项 + 渲染器与标题解析 + 组件库面板辅助。
 * 布局加载编排（loadLayout）与保存/恢复在宿主 WorkspaceBoard 中，依赖画布几何 API。
 */
export function useWorkspaceConfig(deps: WorkspaceConfigDeps) {
  const { t } = useI18n()
  const { dirty } = deps

  // ─── 布局状态 ───
  const components = ref<WorkspaceComponent[]>([])
  const cardTypes = ref<WorkspaceCardType[]>([])
  const favoriteKeys = ref<string[]>([])
  const custom = ref(false)
  const loading = ref(false)

  // ─── 配置模式 ───
  const catalogChoices = ref<CatalogItem[]>([])

  /** 设计01 默认页面的五块；其余卡片类型只在自定义布局/编辑面板中启用。 */
  const DESIGN_DEFAULT_TYPES = new Set([
    'stats',
    'statTodo',
    'statInitiated',
    'statProcessed',
    'statDrafts',
    'todo',
    'favoriteItems',
    'activity',
    'efficiency',
  ])

  /**
   * 后端卡片类型变化后补默认卡片。
   * - 默认布局：只补设计01 的五块，草稿/消息等不凭空出现在首页；
   * - 用户自定义布局：尊重保存的卡片集合，不把用户主动移除的卡片塞回来。
   */
  function withNewComponents(list: WorkspaceComponent[], isCustom: boolean): WorkspaceComponent[] {
    if (isCustom) return [...list]
    const keys = new Set(list.map((c) => c.key))
    const merged = [...list]
    const defaults: WorkspaceComponent[] = cardTypes.value.map((type) => ({
      key: type.typeCode,
      visible: DESIGN_DEFAULT_TYPES.has(type.typeCode),
      order: type.defaultOrder,
      span: type.defaultSpan,
      metadata: defaultMetadata(type),
    }))
    for (const d of defaults) {
      if (!keys.has(d.key)) merged.push(d)
    }
    return merged
  }

  function defaultMetadata(type: WorkspaceCardType): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(type.metadataJson || '{}')
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }

  /** 布局响应归一化：卡片/类型/常用事项落进状态（几何水合与数据加载由宿主编排）。 */
  function applyLayoutResponse(resp: WorkspaceLayoutResp): void {
    custom.value = resp.custom
    cardTypes.value = resp.cardTypes ?? []
    const rawCards = (resp.layout.cards ?? resp.layout.components ?? []) as Array<
      WorkspaceCard | WorkspaceComponent
    >
    components.value = withNewComponents(
      rawCards.map((card): WorkspaceComponent => {
        const typeCode: string =
          'key' in card
            ? typeof card.typeCode === 'string' && card.typeCode
              ? card.typeCode
              : card.key
            : (card.typeCode ?? '')
        const instanceId = 'instanceId' in card ? card.instanceId : undefined
        const key = instanceId || typeCode
        return {
          key,
          typeCode,
          instanceId,
          height: card.height,
          // 设计01 默认布局只呈现统计/待办/快捷/效能/动态；草稿与消息保留为
          // 组件库能力，默认隐藏，明确自定义布局按用户保存值原样承接。
          visible: custom.value ? card.visible : DESIGN_DEFAULT_TYPES.has(typeCode) && card.visible,
          order: card.order,
          span: card.span,
          metadata: card.metadata,
        }
      }),
      custom.value,
    )
    favoriteKeys.value = resp.layout.favoriteItemKeys
  }

  async function loadCatalogChoices() {
    try {
      const page = await queryCatalogItems({ pageNum: 1, pageSize: 100 })
      catalogChoices.value = page.list
    } catch {
      ElMessage.error(t('common.loadFailed'))
      // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
      catalogChoices.value = []
    }
  }

  function setVisible(component: WorkspaceComponent, value: boolean) {
    component.visible = value
    dirty.value = true
  }

  function toggleFavorite(key: string) {
    const index = favoriteKeys.value.indexOf(key)
    if (index >= 0) {
      favoriteKeys.value.splice(index, 1)
    } else if (favoriteKeys.value.length < 20) {
      favoriteKeys.value.push(key)
    } else {
      ElMessage.warning(t('workflow.favoritesLimit'))
      return
    }
    dirty.value = true
  }

  function isComponentIncluded(typeCode: string): boolean {
    return components.value.some((component) => component.key === typeCode)
  }

  /**
   * 工作台卡片标题的**文案键**（不是求值结果）：渲染期解析，保证语言切换后跟随。
   */
  const COMPONENT_TITLE_KEYS: Record<string, string> = {
    todo: 'workflow.myTodoTitle',
    myProcessed: 'workflow.myProcessed',
    myInitiated: 'common.startedByMe',
    cc: 'workflow.cc',
    favoriteItems: 'workflow.favoriteItems',
    drafts: 'common.statusDraft',
    messages: 'common.message',
  }

  /** 卡片标题显示名：新版数据组件优先使用保存的标题，其余按卡片类型/文案键解析。 */
  function componentTitle(key: string): string {
    const component = components.value.find((item) => item.key === key)
    const savedTitle = component?.metadata?.title
    if (typeof savedTitle === 'string' && savedTitle.trim()) return savedTitle
    const typeCode = component?.typeCode ?? key
    const configured = cardTypes.value.find((type) => type.typeCode === typeCode)
    return (
      configured?.displayName ??
      (COMPONENT_TITLE_KEYS[typeCode] ? t(COMPONENT_TITLE_KEYS[typeCode]) : typeCode)
    )
  }

  function rendererKeyOf(key: string): string {
    const component = components.value.find((item) => item.key === key)
    return rendererKeyFor(component?.typeCode ?? key, cardTypes.value)
  }

  function dataConfigOf(component: WorkspaceComponent): WorkspaceDataConfig {
    const config = component.metadata?.dataConfig
    return config && typeof config === 'object' ? (config as WorkspaceDataConfig) : {}
  }

  function dataKindOf(component: WorkspaceComponent): 'metric' | 'chart' | 'list' | null {
    const renderer = rendererKeyOf(component.key)
    return renderer === 'metric' || renderer === 'chart' || renderer === 'list' ? renderer : null
  }

  const showTodoPanel = computed(() =>
    components.value.some((c) => rendererKeyOf(c.key) === 'todo' && c.visible),
  )
  const showStats = computed(() =>
    components.value.some((c) => rendererKeyOf(c.key) === 'stats' && c.visible),
  )
  const showActivity = computed(() =>
    components.value.some(
      (c) =>
        (rendererKeyOf(c.key) === 'activity' ||
          ['myProcessed', 'myInitiated', 'cc'].includes(c.key)) &&
        c.visible,
    ),
  )

  return {
    components,
    cardTypes,
    favoriteKeys,
    custom,
    loading,
    catalogChoices,
    loadCatalogChoices,
    DESIGN_DEFAULT_TYPES,
    withNewComponents,
    defaultMetadata,
    applyLayoutResponse,
    setVisible,
    toggleFavorite,
    isComponentIncluded,
    componentTitle,
    rendererKeyOf,
    dataConfigOf,
    dataKindOf,
    showTodoPanel: showTodoPanel as ComputedRef<boolean>,
    showStats: showStats as ComputedRef<boolean>,
    showActivity: showActivity as ComputedRef<boolean>,
  }
}

export type WorkspaceConfigApi = ReturnType<typeof useWorkspaceConfig>
