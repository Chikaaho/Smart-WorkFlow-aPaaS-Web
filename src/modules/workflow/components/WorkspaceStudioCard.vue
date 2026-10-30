<script setup lang="ts">
/** 全屏工作台配置的单张卡片外壳：编辑 chrome 与真实内容渲染。 */
import { computed } from 'vue'
import type { PackedRect, StudioCard } from '../utils/workspace-studio'
import { kindOf } from '../utils/workspace-studio'
import WorkspaceDataCard from './WorkspaceDataCard.vue'
import WorkspaceSystemCard from './WorkspaceSystemCard.vue'

const props = defineProps<{
  card: StudioCard
  rect: PackedRect
  editable: boolean
  selected: boolean
  favoriteKeys: string[]
}>()

const emit = defineEmits<{
  select: [id: string]
  remove: [id: string]
  dragstart: [id: string]
  drop: [id: string]
  resize: [event: globalThis.PointerEvent, card: StudioCard]
}>()

const kind = computed(() => kindOf(props.card.typeCode))

function onDragStart(event: globalThis.DragEvent): void {
  if (!props.editable) return
  event.dataTransfer?.setData('text/workspace-card', props.card.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  emit('dragstart', props.card.id)
}

function onDrop(event: globalThis.DragEvent): void {
  if (!props.editable) return
  event.preventDefault()
  emit('drop', props.card.id)
}
</script>

<template>
  <article
    class="wscard"
    :class="{ 'is-selected': selected, 'is-editable': editable }"
    :style="{
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
    }"
    :data-instance-id="card.id"
    @click.stop="emit('select', card.id)"
  >
    <header
      class="wscard__head"
      :draggable="editable"
      @dragstart="onDragStart"
      @dragover.prevent
      @drop="onDrop"
    >
      <span v-if="editable" class="wscard__grip" aria-hidden="true">⠿</span>
      <h3>{{ card.title }}</h3>
      <button
        v-if="editable"
        type="button"
        class="wscard__remove"
        :title="'移除'"
        @click.stop="emit('remove', card.id)"
      >
        🗑
      </button>
    </header>
    <div class="wscard__body">
      <WorkspaceSystemCard
        v-if="kind === 'system'"
        :type-code="card.typeCode"
        :favorite-keys="favoriteKeys"
      />
      <WorkspaceDataCard v-else :kind="kind" :config="card.config" />
    </div>
    <span
      v-if="editable"
      class="wscard__resize"
      title="拖动调整宽高"
      @pointerdown.stop.prevent="emit('resize', $event, card)"
    />
  </article>
</template>

<style scoped>
.wscard {
  position: absolute;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--sw-border-light, #eef0f4);
  border-radius: 8px;
  background: var(--sw-bg-surface, #fff);
  box-shadow: 0 1px 2px rgb(16 24 40 / 4%);
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.wscard.is-editable {
  cursor: default;
}

.wscard.is-selected {
  border-color: var(--sw-color-primary, #2563eb);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sw-color-primary, #2563eb) 12%, transparent);
}

.wscard__head {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 44px;
  height: 44px;
  padding: 0 16px;
  cursor: default;
}

.wscard.is-editable .wscard__head {
  cursor: grab;
}

.wscard__grip {
  color: var(--sw-text-tertiary, #98a2b3);
  font-size: 13px;
  letter-spacing: -2px;
  user-select: none;
}

.wscard__head h3 {
  flex: 1;
  margin: 0;
  overflow: hidden;
  color: var(--sw-text-primary, #1f2937);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wscard__remove {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--sw-text-tertiary);
  font-size: 12px;
  cursor: pointer;
}

.wscard__remove:hover {
  background: var(--sw-bg-muted, #f3f4f6);
  color: var(--sw-danger, #d92d20);
}

.wscard__body {
  flex: 1;
  min-height: 0;
  padding: 0 16px 16px;
}

.wscard__resize {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 12px;
  height: 12px;
  cursor: nwse-resize;
  background:
    linear-gradient(135deg, transparent 50%, var(--sw-text-tertiary, #98a2b3) 50%, transparent 62%),
    linear-gradient(135deg, transparent 72%, var(--sw-text-tertiary, #98a2b3) 72%, transparent 84%);
  opacity: 0.55;
}
</style>
