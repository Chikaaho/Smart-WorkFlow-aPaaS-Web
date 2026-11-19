<script setup lang="ts">
import { useI18n } from '@/locales'
import type { CatalogItem } from '@/modules/workflow/api/oa'
import type { WorkspaceCardType } from '@/contracts/catalog'

/** 编辑态组件库面板：卡片类型拖拽/点选新增 + 常用事项勾选。 */
defineProps<{
  cardTypes: WorkspaceCardType[]
  catalogChoices: CatalogItem[]
  favoriteKeys: string[]
  isComponentIncluded: (typeCode: string) => boolean
  startPaletteDrag: (typeCode: string, event: globalThis.DragEvent) => void
  addComponent: (typeCode: string) => void
  toggleFavorite: (key: string) => void
}>()

const emit = defineEmits<{ 'drag-end': [] }>()

const { t } = useI18n()
</script>

<template>
  <aside class="wsd-palette">
    <div class="wsd-palette__head">
      <h4>{{ t('workspace.componentLibrary') }}</h4>
      <span>{{ t('workspace.basicComponent') }}</span>
    </div>
    <div class="wsd-palette-list">
      <div
        v-for="type in cardTypes"
        :key="type.typeCode"
        class="wsd-palette-item"
        :class="{ 'is-used': isComponentIncluded(type.typeCode) }"
        draggable="true"
        @dragstart="startPaletteDrag(type.typeCode, $event)"
        @dragend="emit('drag-end')"
        @click="addComponent(type.typeCode)"
      >
        <span class="wsd-palette-item__grip">⋮⋮</span>
        <span class="wsd-palette-item__body">
          <strong>{{ type.displayName }}</strong>
          <small>{{ type.rendererKey }}</small>
        </span>
        <span class="wsd-palette-item__state">
          {{
            isComponentIncluded(type.typeCode) ? t('workspace.added') : t('workspace.dragToCanvas')
          }}
        </span>
      </div>
    </div>
    <h4 class="config-section">{{ t('workflow.favoritesPickerHint') }}</h4>
    <ul class="config-favorites">
      <li v-for="item in catalogChoices" :key="item.itemKey" class="config-list__row">
        <el-checkbox
          :model-value="favoriteKeys.includes(item.itemKey)"
          @change="toggleFavorite(item.itemKey)"
        >
          {{ item.name }}
        </el-checkbox>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.wsd-palette {
  position: absolute;
  z-index: 70;
  top: 12px;
  bottom: 12px;
  left: 12px;
  width: 248px;
  padding: 16px;
  overflow: auto;
  border: 1px solid var(--sw-border);
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 10px 30px rgb(31 42 68 / 12%);
}
.wsd-palette__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.wsd-palette__head h4 {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
  color: var(--sw-text-primary);
}
.wsd-palette__head span {
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  background: #eee8ff;
  color: var(--sw-color-primary);
  font-size: 12px;
}
.wsd-palette__hint {
  margin: 7px 0 14px;
  font-size: 12px;
  line-height: 18px;
  color: var(--sw-text-secondary);
}
.wsd-palette-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wsd-palette-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 58px;
  padding: 9px 10px;
  border: 1px solid var(--sw-border);
  border-radius: 8px;
  background: #fff;
  cursor: grab;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.wsd-palette-item:hover,
.wsd-palette-item:focus-visible {
  border-color: var(--sw-color-primary);
  box-shadow: 0 3px 12px rgb(74 43 175 / 10%);
}
.wsd-palette-item.is-used {
  background: var(--sw-color-primary-softer);
}
.wsd-palette-item__grip {
  color: var(--sw-text-tertiary, #98a2b3);
  letter-spacing: -3px;
  user-select: none;
}
.wsd-palette-item__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.wsd-palette-item__body strong {
  overflow: hidden;
  color: var(--sw-text-primary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wsd-palette-item__body small,
.wsd-palette-item__state {
  color: var(--sw-text-secondary);
  font-size: 11px;
}
.wsd-palette-item__state {
  flex: none;
}
.config-section {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-color-primary);
}
.config-list,
.config-favorites {
  margin: 0;
  padding: 0;
  list-style: none;
}
.config-list__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.config-list__name {
  flex: 1;
}
</style>
