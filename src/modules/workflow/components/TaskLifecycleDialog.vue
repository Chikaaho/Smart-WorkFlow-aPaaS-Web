<script setup lang="ts">
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import { useI18n } from '@/locales'
import { csvToIds, idsToCsv } from '../composables/use-task-lifecycle'
import type { LifecycleKind } from '../composables/use-task-lifecycle'

/**
 * TaskLifecycleDialog — I3 生命周期动作弹窗（转办/委托/沟通/加签）。
 *
 * 按 kind 切换表单段；弹窗状态由页面持有（lifecycleDialog 单一数据源），
 * 字段编辑经 v-model 逐项回写。转办/委托/沟通/加签按设计 273:1877/1901/1925/1949
 * 统一 640 宽（左右 25 → 内容 590）与 32 高输入、80×32 底栏。
 */
defineProps<{
  title: string
  kind: LifecycleKind | null
  submitting: boolean
}>()

const visible = defineModel<boolean>({ required: true })
const targetUserId = defineModel<string>('targetUserId', { required: true })
const receivers = defineModel<string>('receivers', { required: true })
const participants = defineModel<string>('participants', { required: true })
const message = defineModel<string>('message', { required: true })
const mode = defineModel<'SERIAL' | 'PARALLEL'>('mode', { required: true })
const signPosition = defineModel<'BEFORE' | 'AFTER'>('signPosition', { required: true })
const comment = defineModel<string>('comment', { required: true })

const emit = defineEmits<{
  submit: []
}>()

const { t } = useI18n()
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="640px"
    class="action-dialog"
    :close-on-click-modal="false"
  >
    <el-form label-position="top">
      <template v-if="kind === 'TRANSFER' || kind === 'DELEGATE'">
        <el-form-item
          :label="kind === 'TRANSFER' ? t('common.selectUser') : t('workflow.targetUser')"
        >
          <!-- V012-BUG-019：目标用户改选择器（存 id 显示姓名） -->
          <UserRemoteSelect
            :model-value="targetUserId || undefined"
            :placeholder="
              kind === 'TRANSFER' ? t('common.selectUser') : t('workflow.pickTargetUser')
            "
            style="width: 100%"
            @update:model-value="
              (v: string | string[] | null) => {
                targetUserId = v == null || Array.isArray(v) ? '' : String(v)
              }
            "
          />
        </el-form-item>
      </template>
      <template v-if="kind === 'COMMUNICATE'">
        <el-form-item :label="t('workflow.receiversLabel')">
          <!-- V012-BUG-019：接收人改选择器（存 id 显示姓名） -->
          <UserRemoteSelect
            :model-value="csvToIds(receivers)"
            multiple
            :placeholder="t('workflow.pickReceivers')"
            style="width: 100%"
            @update:model-value="
              (v: string | string[] | null) => {
                receivers = Array.isArray(v) ? idsToCsv(v) : ''
              }
            "
          />
        </el-form-item>
        <el-form-item :label="t('workflow.consultContent')">
          <el-input v-model="message" type="textarea" :rows="3" />
        </el-form-item>
      </template>
      <template v-if="kind === 'ADD_SIGN'">
        <el-form-item :label="t('workflow.participantsLabel')">
          <!-- V012-BUG-019：参与人改选择器（存 id 显示姓名） -->
          <UserRemoteSelect
            :model-value="csvToIds(participants)"
            multiple
            :placeholder="t('workflow.pickParticipants')"
            style="width: 100%"
            @update:model-value="
              (v: string | string[] | null) => {
                participants = Array.isArray(v) ? idsToCsv(v) : ''
              }
            "
          />
        </el-form-item>
        <el-form-item :label="t('workflow.signOrder')">
          <el-radio-group v-model="mode">
            <el-radio value="PARALLEL">{{ t('workflow.parallel') }}</el-radio>
            <el-radio value="SERIAL">{{ t('workflow.serial') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('workflow.signPosition')">
          <el-radio-group v-model="signPosition">
            <el-radio value="BEFORE">{{ t('workflow.signBefore') }}</el-radio>
            <el-radio value="AFTER">{{ t('workflow.signAfter') }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </template>
      <el-form-item
        v-if="kind === 'TRANSFER' || kind === 'DELEGATE' || kind === 'ADD_SIGN'"
        :label="t('common.remark')"
      >
        <el-input
          v-model="comment"
          :placeholder="kind === 'TRANSFER' ? t('common.pleaseInput') : t('notify.optionalTag')"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="emit('submit')">
        {{ t('common.confirm') }}
      </el-button>
    </template>
  </el-dialog>
</template>
