<script setup lang="ts">
/**
 * DesignerParticipantPickers — P63 参与人策略 / 动态并行「固定值」的
 * 审批人候选弹窗宿主（人员多选 + 部门树勾选，互不回填）
 * （自 ProcessDesigner.vue 原地迁出，行为不变）。
 */
import ApproverCandidatesDialog from '../views/ApproverCandidatesDialog.vue'
import type { Ref, ComputedRef } from 'vue'
import type { ApproverCandidate } from '@/modules/workflow/api'

/** 审批人候选弹窗宿主绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerParticipantPickersApi {
  /* ── P63 参与人策略 ── */
  /** 部门多选弹窗可见性。 */
  participantDeptPickerVisible: Ref<boolean>
  /** 参与人面板草稿（已选部门 id 回显：participantForm.deptIds）。 */
  participantForm: Ref<{ deptIds: string[] }>
  /** 部门选定回写。 */
  onParticipantDeptsPicked: (depts: Array<{ id: string; name: string }>) => void
  /** 人员多选弹窗可见性。 */
  participantUserPickerVisible: Ref<boolean>
  /** 已选人员 id（回显，十进制字符串转数值保持精度）。 */
  participantUserIds: ComputedRef<number[]>
  /** 人员选定回写。 */
  onParticipantUsersPicked: (candidates: ApproverCandidate[]) => void
  /* ── P63 动态并行「固定值」 ── */
  /** 人员直接选择弹窗可见性。 */
  dynamicUserPickerVisible: Ref<boolean>
  /** 已选对象 id（数值）。 */
  dynamicFixedSelectedIds: ComputedRef<number[]>
  /** 人员选定回写（820 设置面打开时写草稿）。 */
  onDynamicUsersPicked: (candidates: ApproverCandidate[]) => void
  /** 部门直接选择弹窗可见性。 */
  dynamicDeptPickerVisible: Ref<boolean>
  /** 已选部门 id（字符串）。 */
  dynamicFixedSelectedIdList: ComputedRef<string[]>
  /** 部门选定回写（820 设置面打开时写草稿）。 */
  onDynamicDeptsPicked: (depts: Array<{ id: string; name: string }>) => void
}

const props = defineProps<{
  api: DesignerParticipantPickersApi
}>()

const {
  participantDeptPickerVisible,
  participantForm,
  onParticipantDeptsPicked,
  participantUserPickerVisible,
  participantUserIds,
  onParticipantUsersPicked,
  dynamicUserPickerVisible,
  dynamicFixedSelectedIds,
  onDynamicUsersPicked,
  dynamicDeptPickerVisible,
  dynamicFixedSelectedIdList,
  onDynamicDeptsPicked,
} = props.api
</script>

<template>
  <!-- P63 参与人策略「部门负责人」部门多选弹窗（复用同一组件的部门勾选模式） -->
  <div class="approver-dialog-host">
    <ApproverCandidatesDialog
      v-model:visible="participantDeptPickerVisible"
      picker-mode="dept"
      :initial-dept-ids="participantForm.deptIds"
      @pick-depts="onParticipantDeptsPicked"
    />
  </div>
  <!-- P63 参与人策略「指定人员」人员多选弹窗（与既有选择器并存，互不回填） -->
  <div class="approver-dialog-host">
    <ApproverCandidatesDialog
      v-model:visible="participantUserPickerVisible"
      :initial-ids="participantUserIds"
      @pick="onParticipantUsersPicked"
    />
  </div>

  <!-- P63 动态并行「固定值」直接人员选择（新语义逐人分支） -->
  <div class="approver-dialog-host">
    <ApproverCandidatesDialog
      v-model:visible="dynamicUserPickerVisible"
      :initial-ids="dynamicFixedSelectedIds"
      @pick="onDynamicUsersPicked"
    />
  </div>
  <!-- P63 动态并行「固定值」直接部门选择（新语义逐部门分支） -->
  <div class="approver-dialog-host">
    <ApproverCandidatesDialog
      v-model:visible="dynamicDeptPickerVisible"
      picker-mode="dept"
      :initial-dept-ids="dynamicFixedSelectedIdList"
      @pick-depts="onDynamicDeptsPicked"
    />
  </div>
</template>

<style scoped>
/* ── P53 节点12：审批人候选弹窗（审查24 D08-P 收口：980/标题16/24/按钮80×32） ── */
.approver-dialog-host :deep(.el-dialog) {
  --el-dialog-width: min(980px, calc(100vw - 40px)) !important;
  padding: 0;
  border: 1px solid #dde3ef;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
.approver-dialog-host :deep(.el-dialog__header) {
  box-sizing: border-box;
  padding: 20px 24px 12px;
  border-bottom: 1px solid #dde3ef;
}
.approver-dialog-host :deep(.el-dialog__title) {
  font-size: 16px;
  line-height: 24px;
  color: #19233b;
}
.approver-dialog-host :deep(.el-dialog__headerbtn) {
  top: 20px;
  right: 24px;
  font-size: 20px;
}
.approver-dialog-host :deep(.el-dialog__body) {
  padding: 16px 24px 24px;
}
.approver-dialog-host :deep(.el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
  margin: 0;
  padding: 0;
}
/* 搜索框：设计 36px 高 / #FBFCFF 底 / #CBD6E8 描边 */
.approver-dialog-host :deep(.el-input__wrapper) {
  background: #fbfcff;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #cbd6e8 inset;
}
.approver-dialog-host :deep(.el-input__inner) {
  height: 36px;
  color: #19233b;
}
/* 候选列表：卡片化行（60px 行高、奇数行 #FAF5FF），设计稿无列头 */
.approver-dialog-host :deep(.el-table__header-wrapper) {
  display: none;
}
.approver-dialog-host :deep(.el-table td.el-table__cell) {
  padding: 14px 0;
  border-bottom: 1px solid #eef1f8;
}
.approver-dialog-host :deep(.el-table__row:nth-child(odd) .el-table__cell) {
  background-color: #faf5ff;
}
.approver-dialog-host :deep(.el-table .el-table__cell) {
  color: #344164;
}
.approver-dialog-host :deep(.el-table .el-button.is-link) {
  color: var(--sw-color-primary);
}
.approver-dialog-host :deep(.approver-picker__empty),
.approver-dialog-host :deep(.approver-picker__note) {
  color: #8393b5;
}
.approver-dialog-host :deep(.approver-picker__picked) {
  color: var(--sw-color-primary);
}
</style>

<style>
/*
 * Element Plus 将候选人弹窗 teleport 到 body；因此容器前缀选择器不能
 * 覆盖传送后的根节点。节点 12 的结构尺寸必须直接落在实际弹窗上。
 */
:global(.el-dialog.approver-dialog) {
  /* 审查24/27 D08-P：980 外框、三栏 200/404/294、56 行、80×32 底栏。
     B021-028：高度随视口收缩，弹窗内部纵向滚动，不再溢出窗口/看板。 */
  width: 980px !important;
  height: min(732px, calc(100vh - 32px)) !important;
  /* 交还给 EP overlay 的 flex 居中，避免自算 margin 在矮视口下越界 */
  margin: 0 auto !important;
  box-sizing: border-box;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  border: 1px solid #dde3ef;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(19, 31, 58, 0.18);
  overflow: hidden;
  color: #19233b;
}
:global(.el-dialog.approver-dialog .el-dialog__header) {
  flex: 0 0 auto;
}
:global(.el-dialog.approver-dialog .el-dialog__footer) {
  flex: 0 0 auto;
}
:global(.el-dialog.approver-dialog .el-dialog__header) {
  box-sizing: border-box;
  padding: 20px 24px 12px;
  border-bottom: 1px solid #dde3ef;
}
:global(.el-dialog.approver-dialog .el-dialog__title) {
  font-size: 16px;
  line-height: 24px;
  color: #19233b;
}
:global(.el-dialog.approver-dialog .el-dialog__headerbtn) {
  top: 20px;
  right: 24px;
  font-size: 20px;
}
:global(.el-dialog.approver-dialog .el-dialog__body) {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px 24px 16px;
}
:global(.el-dialog.approver-dialog .el-dialog__footer) {
  box-sizing: border-box;
  padding: 20px 27px 12px;
  border-top: 1px solid #dde3ef;
}
:global(.el-dialog.approver-dialog .approver-dialog__tabs) {
  position: relative;
  top: -3px;
  margin-left: 0;
  margin-bottom: 23px;
}
:global(.el-dialog.approver-dialog .approver-dialog__tab) {
  min-width: 102px;
}
:global(.el-dialog.approver-dialog .approver-pane__workspace) {
  position: relative;
  top: 8px;
  left: 0;
}
:global(.el-dialog.approver-dialog .approver-dialog__footnote) {
  position: relative;
  top: 5px;
  left: -2px;
}
:global(.el-dialog.approver-dialog .approver-dialog__panes) {
  flex: 1 1 auto;
  min-height: 0;
  grid-template-columns: 200px 404px 294px;
  gap: 16px;
}
:global(.el-dialog.approver-dialog .approver-pane) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 14px;
}
:global(.el-dialog.approver-dialog .approver-pane__workspace) {
  top: 8px;
}
:global(.el-dialog.approver-dialog .approver-pane--tree .el-tree) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  margin-top: 22.5px;
  margin-left: -8px;
}
:global(.el-dialog.approver-dialog .el-tree-node__content) {
  height: 36px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-pane__rows) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  margin-top: 18px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user) {
  width: calc(100% + 8px);
  margin-left: -4px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user__body) {
  position: relative;
  left: 4px;
  top: -2.5px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .approver-user__body b) {
  position: relative;
  top: -4px;
}
:global(.el-dialog.approver-dialog .approver-pane--list .el-input__inner) {
  position: relative;
  left: -11px;
  width: calc(100% + 11px);
  padding-left: 12px !important;
}
:global(.el-dialog.approver-dialog .approver-user) {
  height: 56px;
  box-sizing: border-box;
  gap: 12px;
}
:global(.el-dialog.approver-dialog .approver-user__avatar) {
  width: 26px;
  height: 26px;
  font-size: 26px;
}
:global(.el-dialog.approver-dialog .approver-picked) {
  height: 60px;
  box-sizing: border-box;
  margin-bottom: 14px;
  gap: 16px;
}
:global(.el-dialog.approver-dialog .approver-picked .approver-user__avatar) {
  width: 24px;
  height: 24px;
  font-size: 24px;
}
:global(.el-dialog.approver-dialog .approver-picked > .el-button) {
  position: relative;
  left: 10px;
  top: -2px;
}
:global(.el-dialog.approver-dialog .approver-pane--picked .approver-pane__title) {
  margin-bottom: 24px;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button:first-child) {
  width: 80px;
}
:global(.el-dialog.approver-dialog .approver-dialog__confirm) {
  width: 80px;
  min-width: 80px;
}
:global(.el-dialog.approver-dialog .approver-dialog__confirm > span) {
  white-space: nowrap;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button + .el-button) {
  margin-left: 0;
}
:global(.el-dialog.approver-dialog .approver-dialog__footer > .el-button > span) {
  position: relative;
  top: -2px;
}
</style>
