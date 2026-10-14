<script setup lang="ts">
/**
 * ScriptDialog — BF20261013-022② 统一脚本编辑弹窗。
 *
 * 左侧按分类展示可用函数：点击函数行把用法片段插入右侧脚本输入框；
 * 函数行尾的问号悬停显示该函数的作用与用法。右侧为脚本编辑区（支持 #函数名 语法糖）。
 * 由调用方传入函数目录（流程脚本 / 表单脚本）与当前脚本，确定后回传编辑结果。
 */
import { computed, ref, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { ScriptFunctionDoc } from './script-catalog'

const props = defineProps<{
  title: string
  functions: ScriptFunctionDoc[]
  /** 打开时的初始脚本。 */
  code: string
  /** 输入框占位（可选）。 */
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  /** 确定应用：回传编辑后的脚本全文。 */
  save: [code: string]
}>()

const visibleModel = defineModel<boolean>('visible', { required: true })

const working = ref('')
watch(visibleModel, (open) => {
  if (open) working.value = props.code ?? ''
})

const categories = computed(() => {
  const seen = new Map<string, ScriptFunctionDoc[]>()
  for (const fn of props.functions) {
    const list = seen.get(fn.category) ?? []
    list.push(fn)
    seen.set(fn.category, list)
  }
  return [...seen.entries()].map(([name, items]) => ({ name, items }))
})

function insertFunction(fn: ScriptFunctionDoc) {
  working.value = working.value.trimEnd()
    ? `${working.value.replace(/\s*$/, '')}\n${fn.snippet};`
    : `${fn.snippet};`
}

function onCancel() {
  visibleModel.value = false
}

function onSave() {
  emit('save', working.value)
  visibleModel.value = false
}
</script>

<template>
  <el-dialog
    v-model="visibleModel"
    :title="title"
    width="min(980px, 96vw)"
    class="script-dialog"
    append-to-body
    :close-on-click-modal="false"
  >
    <div class="script-dialog__body">
      <aside class="script-dialog__catalog">
        <p class="script-dialog__catalog-title">可用函数（点击插入）</p>
        <section v-for="group in categories" :key="group.name" class="script-dialog__group">
          <p class="script-dialog__group-name">{{ group.name }}</p>
          <div v-for="fn in group.items" :key="fn.name" class="script-dialog__fn">
            <button
              type="button"
              class="script-dialog__fn-name"
              :title="`插入 ${fn.snippet}`"
              @click="insertFunction(fn)"
            >
              {{ fn.name }}
            </button>
            <el-tooltip :content="fn.desc" placement="top" effect="dark">
              <el-icon class="script-dialog__fn-help"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </section>
      </aside>
      <div class="script-dialog__editor">
        <el-input
          v-model="working"
          type="textarea"
          :rows="16"
          spellcheck="false"
          class="script-dialog__code"
          :placeholder="placeholder ?? '在此编写脚本；用 #函数名 调用内置函数（名字无需引号）'"
        />
        <p class="script-dialog__hint">
          裸字段名/变量名自动按名字处理（无需引号）；需要动态值时用表达式，如 #获取流程变量("" +
          name)。
        </p>
      </div>
    </div>
    <template #footer>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" @click="onSave">应用</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.script-dialog__body {
  display: flex;
  gap: 14px;
  min-height: 420px;
}

.script-dialog__catalog {
  width: 250px;
  flex: 0 0 250px;
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 10px 12px;
  background: #fafafd;
}

.script-dialog__catalog-title {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.script-dialog__group + .script-dialog__group {
  margin-top: 10px;
}

.script-dialog__group-name {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.script-dialog__fn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 2px 0;
}

.script-dialog__fn-name {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: 13px;
  color: #6d5bd0;
  text-align: left;
}

.script-dialog__fn-name:hover {
  text-decoration: underline;
}

.script-dialog__fn-help {
  color: var(--el-text-color-secondary);
  cursor: help;
  flex: 0 0 auto;
}

.script-dialog__editor {
  flex: 1;
  min-width: 0;
}

.script-dialog__code :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 19px;
}

.script-dialog__hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
