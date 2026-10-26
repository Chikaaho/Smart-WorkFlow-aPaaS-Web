<script setup lang="ts">
/**
 * WorkspaceConfigDialog — 工作台「配置工作台」居中弹窗（273:1600 · direction-ui-completion-020）。
 *
 * 弹窗内复用同一份 WorkspaceBoard 编辑画布（组件库/拖拽/缩放所见即所得），
 * 恢复默认/取消/确定归弹窗页脚；旧全屏编辑路由 /workspace/edit 继续可达，
 * 用户自定义布局两端同源保存，不清掉用户配置。
 * 取消/关闭经 destroy-on-close 丢弃未保存修改；确定仅在保存成功（dirty 归零）后关闭。
 */
import { ref, watch } from 'vue'
import { useI18n } from '@/locales'
import WorkspaceBoard from './WorkspaceBoard.vue'

const visible = defineModel<boolean>('visible', { required: true })
const { t } = useI18n()

const boardRef = ref<InstanceType<typeof WorkspaceBoard> | null>(null)
const saving = ref(false)

async function onConfirm(): Promise<void> {
  const board = boardRef.value
  if (!board) {
    visible.value = false
    return
  }
  saving.value = true
  try {
    await board.saveConfig()
    // 保存失败时 saveConfig 内部提示且 dirty 保持 true：弹窗不关闭，编辑不丢。
    if (!board.dirty) visible.value = false
  } finally {
    saving.value = false
  }
}

async function onReset(): Promise<void> {
  await boardRef.value?.resetConfig()
}

watch(visible, (open) => {
  if (open) saving.value = false
})
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('workspace.configureWorkspace')"
    width="1120px"
    align-center
    destroy-on-close
    append-to-body
    class="workspace-config-dialog"
  >
    <WorkspaceBoard ref="boardRef" editable embedded />
    <template #footer>
      <div class="workspace-config-dialog__footer">
        <button class="wsd-btn" type="button" @click="onReset">
          {{ t('common.restoreDefault') }}
        </button>
        <button class="wsd-btn" type="button" @click="visible = false">
          {{ t('common.cancel') }}
        </button>
        <button
          class="wsd-btn wsd-btn--primary"
          type="button"
          :disabled="saving"
          @click="onConfirm"
        >
          {{ t('common.confirm') }}
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 273:1600 配置工作台为 1120×704 居中浮层：内容超高时只滚动画布区，页脚始终可达。 */
:global(.workspace-config-dialog) {
  display: flex;
  flex-direction: column;
  max-height: min(704px, 90vh);
}

:global(.workspace-config-dialog .el-dialog__body) {
  overflow-y: auto;
}

.workspace-config-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
