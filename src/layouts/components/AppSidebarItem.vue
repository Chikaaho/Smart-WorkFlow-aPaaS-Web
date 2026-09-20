<script setup lang="ts">
import { computed } from 'vue'
import { MenuType, type MenuNode } from '@/contracts/menu'
import { toFullPath } from '../menu-utils'
import { menuIcon } from '../menu-icons'
import { useNodeTitle } from '../menu-title'

// 递归菜单项：目录 → el-sub-menu（可展开），菜单 → el-menu-item（点击经 el-menu router 模式导航）。
// P53 设计同源图标：设计树以 'design:*' 图标名引用锁定设计包裁切资产（logo 同源规则）。
import iconWorkspace from '@/assets/brand/icon-workspace.png'
import iconProcess from '@/assets/brand/icon-process.png'
import iconIntelligence from '@/assets/brand/icon-intelligence.png'

const DESIGN_ICONS: Record<string, string> = {
  workspace: iconWorkspace,
  process: iconProcess,
  intelligence: iconIntelligence,
}

const props = defineProps<{ node: MenuNode; taskDetail?: boolean }>()

const nodeTitle = useNodeTitle()
const designIconName = computed(() => String(props.node.icon ?? '').replace('design:', ''))
const designIconSrc = computed(() => DESIGN_ICONS[designIconName.value])
</script>

<template>
  <el-sub-menu
    v-if="node.menuType === MenuType.DIRECTORY && node.children?.length"
    :index="toFullPath(node)"
  >
    <template #title>
      <img
        v-if="designIconSrc"
        class="app-sidebar__design-icon"
        :src="designIconSrc"
        alt=""
        aria-hidden="true"
      />
      <el-icon v-else-if="menuIcon(node.icon)"><component :is="menuIcon(node.icon)" /></el-icon>
      <span>{{ nodeTitle(node) }}</span>
    </template>
    <AppSidebarItem
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :task-detail="props.taskDetail"
    />
  </el-sub-menu>
  <el-menu-item v-else :index="toFullPath(node)">
    <img
      v-if="designIconSrc"
      class="app-sidebar__design-icon"
      :src="designIconSrc"
      alt=""
      aria-hidden="true"
    />
    <el-icon v-else-if="menuIcon(node.icon)"><component :is="menuIcon(node.icon)" /></el-icon>
    <template #title>
      <span v-if="props.taskDetail" class="app-sidebar__item-label">{{ nodeTitle(node) }}</span>
      <template v-else>{{ nodeTitle(node) }}</template>
    </template>
  </el-menu-item>
</template>

<style scoped>
.app-sidebar__design-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  margin-right: 12px;
}
.app-sidebar__item-label {
  color: #c9d1e8;
}
</style>
