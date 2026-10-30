<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/locales'
import {
  fetchNodeCapabilities,
  groupPaletteCapabilities,
  nodeIconPaths,
} from '@/adapters/process-catalog'
import type { BpmNodeCapability } from '@/contracts/bpm-node'

const { t } = useI18n()
/**
 * UnconfiguredFlowBoard — 表单工作台「流程设计」零关联流程分支的未配置空画布（Q56）。
 *
 * 纯展示复用（Q56 P3/472:15663）：
 *   - 左侧节点库 = 流程设计器节点面板的同一份展示层投影（服务端能力契约 → 面板分组）；
 *   - 右侧为未配置空画布（网格底 + 引导文案），不创建任何流程定义；
 *   - 「新建流程」入口只向上抛 create 事件，命名/持久化仍由宿主既有链路承接；
 *   - 节点条目仅展示（不可拖拽/点击添加），不伪装画布编辑能力。
 */
const emit = defineEmits<{ (e: 'create'): void }>()

const capabilities = ref<BpmNodeCapability[]>([])

onMounted(async () => {
  try {
    const caps = await fetchNodeCapabilities()
    // 与设计器同一口径：子流程等待块由设计器自动生成，不作为可拖入节点展示
    capabilities.value = caps.filter((cap) => cap.type !== 'SUBFLOW_WAIT')
  } catch {
    // 纯展示层：能力目录加载失败时节点库留空，不阻断空画布与创建入口
    capabilities.value = []
  }
})

const paletteGroups = computed(() =>
  groupPaletteCapabilities(capabilities.value, (labelKey) => t(labelKey)),
)
</script>

<template>
  <div class="unconfigured-flow" data-testid="unconfigured-flow-board">
    <!-- 节点库：与流程设计器同一分组/图标/命名（仅展示，不可交互） -->
    <aside class="unconfigured-flow__palette" data-testid="unconfigured-flow-palette">
      <h3 class="unconfigured-flow__palette-title">{{ t('workflow.nodePalette') }}</h3>
      <section
        v-for="group in paletteGroups"
        :key="group.category"
        class="unconfigured-flow__group"
      >
        <h4 class="unconfigured-flow__group-title">{{ group.label }}</h4>
        <div class="unconfigured-flow__group-grid">
          <div
            v-for="cap in group.items"
            :key="cap.type"
            class="unconfigured-flow__item unconfigured-flow__item--display"
            :data-node-type="cap.type"
          >
            <svg
              class="unconfigured-flow__icon"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                v-for="(pathData, pathIndex) in nodeIconPaths(cap.type)"
                :key="pathIndex"
                :d="pathData"
              />
            </svg>
            <span class="unconfigured-flow__item-name">{{ cap.displayName }}</span>
          </div>
        </div>
      </section>
    </aside>

    <!-- 未配置空画布：网格底 + 引导文案 + 创建入口（仅抛事件，不做本地持久化） -->
    <div class="unconfigured-flow__canvas" data-testid="unconfigured-flow-canvas">
      <div class="unconfigured-flow__empty">
        <p class="unconfigured-flow__empty-title">{{ t('form.unconfiguredFlowTitle') }}</p>
        <p class="unconfigured-flow__empty-hint">{{ t('form.unconfiguredFlowHint') }}</p>
        <el-button
          class="unconfigured-flow__create"
          data-testid="unconfigured-flow-create"
          type="primary"
          @click="emit('create')"
        >
          {{ t('form.createProcess') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 几何对齐流程设计器（42:4）：224px 节点库 + 弹性网格画布 */
.unconfigured-flow {
  display: flex;
  flex: 1;
  min-height: 0;
  margin-top: 23px;
  overflow: hidden;
  border: 1px solid var(--sw-border-light, #e7ebf1);
  border-radius: 8px;
  background: var(--sw-surface, #fff);
}

.unconfigured-flow__palette {
  box-sizing: border-box;
  flex: 0 0 224px;
  width: 224px;
  padding: 16px;
  overflow-y: auto;
  border-right: 1px solid #e1e5ef;
}

.unconfigured-flow__palette-title {
  margin: 0 0 12px;
  color: #1f2a44;
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}

.unconfigured-flow__group + .unconfigured-flow__group {
  margin-top: 12px;
}

.unconfigured-flow__group-title {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: #7e89a1;
}

.unconfigured-flow__group-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.unconfigured-flow__item {
  --palette-accent: var(--sw-color-primary);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  box-sizing: border-box;
  width: 188px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid #e0e6f2;
  border-radius: 6px;
  background: #fbfcff;
  color: #344164;
  font-size: 12px;
  line-height: 16px;
}

.unconfigured-flow__item--display {
  cursor: default;
}

.unconfigured-flow__item-name {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  white-space: nowrap;
}

.unconfigured-flow__icon {
  flex: 0 0 20px;
  display: block;
}

.unconfigured-flow__icon path {
  fill: none;
  stroke: var(--palette-accent);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.unconfigured-flow__item[data-node-type='START'] {
  --palette-accent: #12805c;
}
.unconfigured-flow__item[data-node-type='END'] {
  --palette-accent: #c2303a;
}
.unconfigured-flow__item[data-node-type='CONDITION'],
.unconfigured-flow__item[data-node-type='PARALLEL_GATEWAY'] {
  --palette-accent: #d98c10;
}

.unconfigured-flow__canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  /* P53 节点09：画布底 #F8FAFE + 24px 网格线 */
  background:
    linear-gradient(to right, #e8edf6 1px, transparent 1px),
    linear-gradient(to bottom, #e8edf6 1px, transparent 1px);
  background-size: 24px 24px;
  background-color: #f8fafe;
}

.unconfigured-flow__empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.unconfigured-flow__empty-title {
  margin: 0 0 8px;
  color: #1f2937;
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.unconfigured-flow__empty-hint {
  margin: 0 0 20px;
  color: #687386;
  font-size: 13px;
  line-height: 20px;
}

.unconfigured-flow__create {
  height: 36px;
}
</style>
