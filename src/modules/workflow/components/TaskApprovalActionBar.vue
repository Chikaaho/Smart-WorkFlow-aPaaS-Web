<script setup lang="ts">
import type { Component } from 'vue'
import { ArrowDown, Bell, ChatLineSquare, Plus, Rank, User } from '@element-plus/icons-vue'
import { useI18n } from '@/locales'
import type { ApprovalMoreAction, ApprovalMoreCommand } from '../composables/use-task-lifecycle'

/**
 * TaskApprovalActionBar — 审批操作栏（主操作直达 + 「更多」菜单）。
 *
 * 通过/驳回（或「不通过」）主按钮保持直达；有权限且被节点策略允许的
 * 转办/委托/沟通/加签与催办统一收进「更多」。可见性交集由页面计算后传入。
 */
defineProps<{
  canAct: boolean
  canReturn: boolean
  hasReturnTargets: boolean
  negativeAction: 'REJECT' | 'DISAPPROVE' | null
  canApprove: boolean
  acting: string | null
  moreActions: ApprovalMoreAction[]
}>()

const emit = defineEmits<{
  return: []
  reject: []
  approve: []
  more: [command: string]
}>()

const { t } = useI18n()

/** 设计 299:1725 每项原图标：催办=铃、转办=双向箭头、委托=人员、沟通=会话、加签=加号。 */
const APPROVAL_MORE_ICONS: Record<ApprovalMoreCommand, Component> = {
  URGE: Bell,
  TRANSFER: Rank,
  DELEGATE: User,
  COMMUNICATE: ChatLineSquare,
  ADD_SIGN: Plus,
}

function onMoreCommand(command: string | number | object): void {
  emit('more', String(command))
}
</script>

<template>
  <!-- 主操作保持直达；有权限且被节点策略允许的转办/委托/沟通/加签与催办统一收进“更多”。 -->
  <div class="detail-actions__bar">
    <div v-if="canReturn && hasReturnTargets" class="return-config">
      <el-button
        type="warning"
        :loading="acting === 'return'"
        :disabled="acting !== null"
        data-testid="return-open-dialog"
        @click="emit('return')"
        >{{ t('common.returnBack') }}</el-button
      >
    </div>
    <div class="detail-actions__btns">
      <template v-if="canAct">
        <el-button
          v-if="negativeAction"
          type="danger"
          plain
          data-testid="negative-action-button"
          :loading="acting === 'reject'"
          :disabled="acting !== null"
          @click="emit('reject')"
        >
          {{ negativeAction === 'REJECT' ? t('common.reject') : t('workflow.disapprove') }}
        </el-button>
        <el-button
          v-if="canApprove"
          type="primary"
          :loading="acting === 'approve'"
          :disabled="acting !== null"
          @click="emit('approve')"
        >
          {{ t('workflow.approveTask') }}
        </el-button>
      </template>
      <el-dropdown
        v-if="moreActions.length > 0"
        class="detail-actions__more"
        trigger="click"
        popper-class="detail-actions-more-popper"
        :disabled="acting !== null"
        @command="onMoreCommand"
      >
        <el-button
          class="detail-actions__more-trigger"
          :disabled="acting !== null"
          data-testid="approval-more-trigger"
        >
          {{ t('common.moreActions') }}
          <el-icon><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu class="detail-actions__more-menu">
            <el-dropdown-item
              v-for="action in moreActions"
              :key="action.command"
              :command="action.command"
              :divided="action.divided"
              :disabled="acting !== null"
              :data-testid="`approval-more-${action.command.toLowerCase()}`"
            >
              <el-icon class="detail-actions__more-item-icon" aria-hidden="true">
                <component :is="APPROVAL_MORE_ICONS[action.command]" />
              </el-icon>
              {{ action.label }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.detail-actions__bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  border-top: 1px dashed var(--sw-border-lighter);
  padding-top: 10px;
}
.detail-actions__btns {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
  margin-left: auto;
}
/* Element Plus 只给相邻 el-button 加 margin-left，dropdown 包裹的「更多」不在该选择器内，
   导致按钮间距不一致；改为容器统一 gap 后归零，保证任意相邻按钮间距相同。 */
.detail-actions__btns :deep(.el-button + .el-button) {
  margin-left: 0;
}
.detail-actions__more {
  flex: 0 0 auto;
}
.detail-actions__more-trigger :deep(.el-icon) {
  margin-left: 4px;
}
.return-config {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-right: auto;
  font-size: 13px;
  color: var(--sw-text-regular);
}
</style>

<style>
/* 设计 299:1725（Q68）更多菜单：teleport 浮层根按类定宽 192（含边框），
   适用项 36 高、相邻步长 38（gap 2）、每项带原图标（铃/双向箭头/人员/会话/加号）。
   EP 的 divided 语义保留在 DOM，但原图两项间无分隔线，行距由 gap 控制
   （同批次应用卡操作菜单 app-card-op-menu 同一模式）。 */
.detail-actions-more-popper.el-popper {
  box-sizing: border-box;
  width: 192px;
  padding: 0;
}
.detail-actions-more-popper .el-dropdown-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
}
.detail-actions-more-popper .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 36px;
  line-height: 36px;
  padding: 0 16px;
}
.detail-actions-more-popper .el-dropdown-menu__item .el-icon {
  margin-right: 0;
  font-size: 16px;
}
.detail-actions-more-popper .el-dropdown-menu__item--divided {
  /* EP 的 divided 会插入一个空的分隔 li：原图两项间无可见分隔线，行距由 gap 控制，
     分隔语义保留在 divided prop 与 DOM 标记上，display:none 保证相邻步长恒为 38。 */
  display: none;
}
</style>
