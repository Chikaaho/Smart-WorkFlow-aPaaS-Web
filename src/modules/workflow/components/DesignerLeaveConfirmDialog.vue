<script setup lang="ts">
/**
 * DesignerLeaveConfirmDialog — 0.2.0 Q55（设计 272:1575）未保存离开确认：
 * 600 宽三选一——取消/不保存/保存，保存成功后才离开
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import { useI18n } from '@/locales'

const { t } = useI18n()

const visible = defineModel<boolean>({ required: true })

defineProps<{
  /** 保存进行中（按钮禁用/loading）。 */
  saving: boolean
}>()

const emit = defineEmits<{
  /** 取消/不保存：proceed=false 或 true（不保存也会离开）。 */
  settle: [proceed: boolean]
  /** 保存并离开。 */
  save: []
}>()
</script>

<template>
  <!-- 0.2.0 Q55（设计 272:1575）：未保存离开确认，保存成功后才离开。 -->
  <el-dialog
    v-model="visible"
    class="designer-leave-confirm"
    align-center
    width="600px"
    append-to-body
    :title="t('workflow.designerSaveChangesTitle')"
    @closed="emit('settle', false)"
  >
    <template #footer>
      <el-button :disabled="saving" @click="emit('settle', false)">
        {{ t('common.cancel') }}
      </el-button>
      <el-button :disabled="saving" @click="emit('settle', true)">
        {{ t('workflow.designerDiscardChanges') }}
      </el-button>
      <el-button type="primary" :loading="saving" @click="emit('save')">
        {{ t('common.save') }}
      </el-button>
    </template>
  </el-dialog>

  <!-- P64 弹窗可达性全局规则：append-to-body 传送后不带 scoped 属性，需全局选择器。 -->
  <style>
    /* ═══ 0.2.0 Q55（设计 272:1575）：未保存离开确认——600 宽、标题 16/24、
   取消/不保存/保存 三按钮各 80×32，右下对齐。 ═══ */
    .el-dialog.designer-leave-confirm {
      --el-dialog-padding-primary: 0px;
      box-sizing: border-box;
      width: 600px;
      max-width: calc(100vw - 32px);
      padding: 0;
      border: 1px solid var(--sw-border-light);
      border-radius: 12px;
    }
    .designer-leave-confirm .el-dialog__header,
    .designer-leave-confirm .el-dialog__header.show-close {
      box-sizing: border-box;
      margin: 0;
      padding: 27px 56px 0 24px;
    }
    .designer-leave-confirm .el-dialog__title {
      font-size: 16px;
      font-weight: 500;
      line-height: 24px;
      color: var(--sw-text-primary);
    }
    .designer-leave-confirm .el-dialog__headerbtn {
      top: 27px;
      right: 24px;
      width: 24px;
      height: 24px;
    }
    .designer-leave-confirm .el-dialog__body {
      padding: 0;
    }
    .designer-leave-confirm .el-dialog__footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      padding: 23px 24px 26px;
    }
    .designer-leave-confirm .el-dialog__footer .el-button {
      box-sizing: border-box;
      width: 80px;
      height: 32px;
      margin: 0;
      padding: 0;
    }
  </style>
</template>
