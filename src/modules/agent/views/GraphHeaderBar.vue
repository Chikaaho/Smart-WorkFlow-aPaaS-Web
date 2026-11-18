<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useI18n } from '@/locales'

/** 图设计器头部：标题/版本、只读徽标、撤销重做/整理布局/保存草稿/发布/返回列表。 */
defineProps<{
  graphName: string
  version: number | null
  canEdit: boolean
  canUndo: boolean
  canRedo: boolean
  saving: boolean
  publishing: boolean
}>()

const emit = defineEmits<{
  undo: []
  redo: []
  'auto-layout': []
  'save-draft': []
  publish: []
}>()

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <div class="designer-header">
    <div class="header-title">
      <span class="title-text">{{ graphName || t('agent.untitledGraph') }}</span>
      <el-tag v-if="version" size="small" type="info">v{{ version }}</el-tag>
    </div>
    <div class="header-actions">
      <el-tag v-if="!canEdit" size="small" type="warning">{{ t('agent.readOnlyMode') }}</el-tag>
      <template v-if="canEdit">
        <el-button-group>
          <el-button size="small" :disabled="!canUndo" @click="emit('undo')">
            {{ t('agent.undo') }}
          </el-button>
          <el-button size="small" :disabled="!canRedo" @click="emit('redo')">
            {{ t('agent.redo') }}
          </el-button>
        </el-button-group>
        <el-button size="small" @click="emit('auto-layout')">{{ t('agent.autoLayout') }}</el-button>
        <el-button size="small" type="primary" :loading="saving" @click="emit('save-draft')">
          {{ t('common.saveDraft') }}
        </el-button>
        <el-button size="small" type="success" :loading="publishing" @click="emit('publish')">
          {{ t('common.publish') }}
        </el-button>
      </template>
      <el-button size="small" @click="router.push('/agent/graph-def')">
        {{ t('common.backToList') }}
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.designer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
