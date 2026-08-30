<script setup lang="ts">
/**
 * 字典选择（DICT）配置面板。
 * 契约键：label / name / required / dictType（绑定字典）/ renderAs（下拉 or 单选）。
 * 默认值无契约键 → seam（禁自造键）。
 *
 * 绑定字典走真接：foundation/dict.listDictTypes()（单一请求层 foundation/request）。
 * 字典是横切基础设施，清单读取沉淀在 foundation/dict —— modules/form 不直引 modules/system
 * 的字典管理 API，遵守跨模块导入边界。取不到（后端未就绪）时下拉留空，作者可重选不阻塞。
 */
import { ref, onMounted } from 'vue'
import type { DictField } from '@/contracts/form-schema'
import { listDictTypes, type DictTypeItem } from '@/foundation/dict'
import type { FieldPatch } from '../field-config'
import CommonConfigRows from './CommonConfigRows.vue'
import ConfigSeamNote from './ConfigSeamNote.vue'

const props = defineProps<{ field: DictField; otherNames: string[] }>()
const emit = defineEmits<{ update: [patch: FieldPatch] }>()

const dictTypes = ref<DictTypeItem[]>([])

onMounted(async () => {
  try {
    dictTypes.value = await listDictTypes()
  } catch {
    // 非阻塞：字典类型清单取不到则留空，作者可稍后重开面板重试。
  }
})
</script>

<template>
  <div>
    <CommonConfigRows
      :label="props.field.label ?? ''"
      :name="props.field.name"
      :required="props.field.required ?? false"
      :other-names="props.otherNames"
      @update="(p) => emit('update', p)"
    />

    <div class="row">
      <label class="row__label">绑定字典</label>
      <el-select
        :model-value="props.field.dictType"
        placeholder="选择字典类型"
        class="row__control"
        @update:model-value="(v: string) => emit('update', { dictType: v })"
      >
        <el-option
          v-for="dt in dictTypes"
          :key="dt.code"
          :label="`${dt.name}（${dt.code}）`"
          :value="dt.code"
        />
      </el-select>
    </div>

    <div class="row">
      <label class="row__label">显示方式</label>
      <el-radio-group
        :model-value="props.field.renderAs ?? 'select'"
        @update:model-value="
          (v: string | number | boolean | undefined) =>
            emit('update', { renderAs: v === 'radio' ? 'radio' : 'select' })
        "
      >
        <el-radio value="select">下拉</el-radio>
        <el-radio value="radio">单选</el-radio>
      </el-radio-group>
    </div>

    <ConfigSeamNote :items="['默认值']" />
  </div>
</template>

<style scoped>
.row {
  margin-bottom: var(--sw-space-16);
}

.row__label {
  display: block;
  margin-bottom: var(--sw-space-4);
  font-size: var(--sw-font-emphasis);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-regular);
}

.row__control {
  width: 100%;
}
</style>
