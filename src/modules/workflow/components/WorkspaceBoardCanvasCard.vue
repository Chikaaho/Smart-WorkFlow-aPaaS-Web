<script setup lang="ts">
import { useI18n } from '@/locales'
import { EDGES, CORNERS } from './use-workspace-canvas'
import type { WorkspaceComponent } from '@/contracts/catalog'

/**
 * 画布卡片外框：位置尺寸由宿主 itemStyle 经 style 透传；
 * 编辑态含标题栏（拖拽/显隐）与 8 向缩放手柄；正文经默认插槽承接各渲染器面板。
 */
defineProps<{
  component: WorkspaceComponent
  title: string
  renderer: string
  editing: boolean
  selected: boolean
  dragging: boolean
  resizing: boolean
  resizeHandle: string
}>()

const emit = defineEmits<{
  'move-drag': [event: globalThis.PointerEvent]
  'resize-drag': [event: globalThis.PointerEvent, handle: string]
  'toggle-visible': []
}>()

const { t } = useI18n()
</script>

<template>
  <article
    class="wsd-canvas-item"
    :class="{
      'is-hidden': !component.visible,
      'is-dragging': dragging,
      'is-selected': editing && selected,
    }"
    @pointerdown="emit('move-drag', $event)"
  >
    <header
      v-if="editing"
      class="wsd-canvas-item__bar"
      @pointerdown.stop="emit('move-drag', $event)"
    >
      <span class="wsd-canvas-item__grip">⠿</span>
      <strong class="wsd-canvas-item__title">{{ title }}</strong>
      <span class="wsd-canvas-item__renderer">{{ renderer }}</span>
      <button
        class="wsd-canvas-item__btn"
        type="button"
        @pointerdown.stop
        @click="emit('toggle-visible')"
      >
        {{ component.visible ? t('workspace.visible') : t('workspace.hidden') }}
      </button>
    </header>

    <div class="wsd-canvas-item__body">
      <slot />
    </div>

    <template v-if="editing">
      <span
        v-for="edge in EDGES"
        :key="'edge-' + edge"
        class="wsd-edge"
        :class="[
          `wsd-edge--${edge}`,
          {
            'is-active': resizing && resizeHandle === edge,
          },
        ]"
        @pointerdown.stop="emit('resize-drag', $event, edge)"
      />
      <span
        v-for="corner in CORNERS"
        :key="'corner-' + corner"
        class="wsd-corner"
        :class="`wsd-corner--${corner}`"
        @pointerdown.stop="emit('resize-drag', $event, corner)"
      />
    </template>
  </article>
</template>

<style scoped>
.wsd-canvas-item {
  position: absolute;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.wsd-canvas-item.is-hidden {
  opacity: 0.55;
}
.wsd-canvas-item.is-dragging {
  z-index: 40;
}
.wsd-canvas-item.is-selected {
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 1px var(--sw-color-primary);
}
.wsd-canvas-item.is-selected.is-dragging {
  box-shadow:
    0 0 0 1px var(--sw-color-primary),
    0 12px 30px rgb(31 42 68 / 18%);
}
.wsd-canvas-item.is-selected .wsd-canvas-item__bar {
  background: #e9e0ff;
}
.wsd-canvas-item__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  flex: none;
  padding: 0 10px;
  border: 1px solid var(--sw-border);
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  background: #f2ecff;
  cursor: grab;
  user-select: none;
}
.wsd-canvas-item.is-dragging .wsd-canvas-item__bar {
  cursor: grabbing;
}
.wsd-canvas-item__grip {
  color: var(--sw-color-primary);
  letter-spacing: -2px;
}
.wsd-canvas-item__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsd-canvas-item__renderer {
  max-width: 90px;
  overflow: hidden;
  font-size: 11px;
  color: var(--sw-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsd-canvas-item__btn {
  height: 22px;
  flex: none;
  padding: 0 8px;
  border: 1px solid var(--sw-border);
  border-radius: 6px;
  background: #ffffff;
  font-size: 11px;
  color: var(--sw-text-secondary);
  cursor: pointer;
}
.wsd-canvas-item__body {
  position: relative;
  flex: 1;
  min-height: 0;
}
.wsd.is-editing .wsd-canvas-item__body {
  pointer-events: none;
}
.wsd-edge {
  position: absolute;
  z-index: 6;
}
.wsd-edge--n {
  top: -3px;
  right: 6px;
  left: 6px;
  height: 7px;
  cursor: ns-resize;
}
.wsd-edge--s {
  right: 6px;
  bottom: -3px;
  left: 6px;
  height: 7px;
  cursor: ns-resize;
}
.wsd-edge--e {
  top: 6px;
  right: -3px;
  bottom: 6px;
  width: 7px;
  cursor: ew-resize;
}
.wsd-edge--w {
  top: 6px;
  bottom: 6px;
  left: -3px;
  width: 7px;
  cursor: ew-resize;
}
.wsd-edge::after {
  content: '';
  position: absolute;
  border-radius: 2px;
  background: var(--sw-color-primary);
  opacity: 0;
  transition: opacity 0.12s ease;
}
.wsd-edge--n::after {
  top: 2px;
  right: 0;
  left: 0;
  height: 2px;
}
.wsd-edge--s::after {
  right: 0;
  bottom: 2px;
  left: 0;
  height: 2px;
}
.wsd-edge--e::after {
  top: 0;
  right: 2px;
  bottom: 0;
  width: 2px;
}
.wsd-edge--w::after {
  top: 0;
  bottom: 0;
  left: 2px;
  width: 2px;
}
.wsd-edge:hover::after,
.wsd-edge.is-active::after {
  opacity: 1;
}
.wsd-corner {
  position: absolute;
  z-index: 7;
  width: 14px;
  height: 14px;
}
.wsd-corner--ne {
  top: -6px;
  right: -6px;
  cursor: nesw-resize;
}
.wsd-corner--nw {
  top: -6px;
  left: -6px;
  cursor: nwse-resize;
}
.wsd-corner--se {
  right: -6px;
  bottom: -6px;
  cursor: nwse-resize;
}
.wsd-corner--sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}
</style>
