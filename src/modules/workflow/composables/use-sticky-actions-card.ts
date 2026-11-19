import { computed, onUnmounted, ref, watch } from 'vue'

/** useStickyActionsCard 入参。 */
export interface StickyActionsCardOptions {
  /** 是否嵌入统一详情弹窗（非弹窗场景滚动容器额外预留 24px 页底边距）。 */
  embedded: () => boolean
}

/** 操作卡吸底布局（TaskDetail 页拆分）：按实测高度为滚动容器预留底部空间。 */
export function useStickyActionsCard(options: StickyActionsCardOptions) {
  // G4-1：操作卡吸底，滚动容器按其**实测高度**预留底部空间；
  // 只用固定 padding 会在意见框展开后重新遮挡明细最后一行。
  const actionsCardRef = ref<{ $el?: unknown } | null>(null)
  const actionsCardHeight = ref(0)
  let actionsResizeObserver: ResizeObserver | null = null

  function syncActionsCardHeight(): void {
    const element = actionsCardRef.value?.$el
    if (!(element instanceof HTMLElement)) {
      actionsCardHeight.value = 0
      return
    }
    actionsCardHeight.value = Math.ceil(element.getBoundingClientRect().height)
  }

  watch(actionsCardRef, (card) => {
    actionsResizeObserver?.disconnect()
    actionsResizeObserver = null
    const element = card?.$el
    if (!(element instanceof HTMLElement)) {
      actionsCardHeight.value = 0
      return
    }
    syncActionsCardHeight()
    if (typeof ResizeObserver === 'undefined') return
    actionsResizeObserver = new ResizeObserver(syncActionsCardHeight)
    actionsResizeObserver.observe(element)
  })

  onUnmounted(() => actionsResizeObserver?.disconnect())

  const detailScrollStyle = computed(() => ({
    paddingBottom: `${actionsCardHeight.value + (options.embedded() ? 0 : 24)}px`,
  }))

  return { actionsCardRef, syncActionsCardHeight, detailScrollStyle }
}
