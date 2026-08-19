import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import importPlugin from 'eslint-plugin-import'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'

// 业务模块清单：对齐后端 sw-biz-* 划分。模块间禁止互相 import。
const MODULES = ['system', 'lowcode', 'workflow', 'notify', 'agent', 'iot', 'openapi']

const crossModuleZones = MODULES.map((target) => ({
  target: `./src/modules/${target}/**/*`,
  from: MODULES.filter((m) => m !== target).map((m) => `./src/modules/${m}/**/*`),
  message:
    'modules 之间禁止互相 import，业务模块需通过 facade/event 机制交互（骨架阶段暂未提供）。',
}))

// 易变第三方库只能在各自的防腐层/地基层出现，业务层一律禁止直引。
const THIRD_PARTY_RESTRICTIONS = {
  paths: [
    { name: 'axios', message: '业务层禁止直引 axios，请通过 foundation/request 调用。' },
    { name: 'dompurify', message: '业务层禁止直引 dompurify，请通过 security/sanitize 调用。' },
    {
      name: 'expr-eval-fork',
      message: '业务层禁止直引 expr-eval-fork，请通过 security/safe-eval 调用。',
    },
    {
      name: 'form-create',
      message: '业务层禁止直引 form-create，请通过 adapters/form-designer 调用。',
    },
    { name: 'bpmn-js', message: '业务层禁止直引 bpmn-js，请通过 adapters/bpmn 调用。' },
  ],
  patterns: [
    {
      group: ['@form-create/*'],
      message: '业务层禁止直引 form-create，请通过 adapters/form-designer 调用。',
    },
    {
      group: ['@vue-flow/*'],
      message: '业务层禁止直引 @vue-flow，请通过 adapters/flow-graph 调用。',
    },
  ],
}

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/contracts/api-types/**',
      // Element Plus 按需自动导入的生成产物，同 contracts/api-types 纳入忽略。
      'src/types/auto-imports.d.ts',
      'src/types/components.d.ts',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
      },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    languageOptions: {
      // 标准运行时全局（Node 18+ / 浏览器 / vitest 均内置），避免 no-undef 误报。
      globals: {
        globalThis: 'readonly',
      },
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
    rules: {
      'import/no-named-as-default-member': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'vue/no-v-html': 'error',
      'import/no-unresolved': 'off',
    },
  },
  // 边界规则一：业务模块之间禁止互相 import。
  {
    files: ['src/modules/**/*.{ts,vue}'],
    rules: {
      'import/no-restricted-paths': ['error', { zones: crossModuleZones }],
    },
  },
  // 边界规则二：业务模块禁止直引易变第三方库，只能走 foundation/*、security/*、adapters/*、contracts/*。
  {
    files: ['src/modules/**/*.{ts,vue}'],
    rules: {
      'no-restricted-imports': ['error', THIRD_PARTY_RESTRICTIONS],
    },
  },
  // 边界规则三：危险 API（dompurify/expr-eval-fork）只允许在 security/* 内出现。
  {
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/security/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'dompurify', message: '只允许 security/sanitize 内部使用 dompurify。' },
            {
              name: 'expr-eval-fork',
              message: '只允许 security/safe-eval 内部使用 expr-eval-fork。',
            },
          ],
        },
      ],
    },
  },
  // 边界规则四：axios 只允许在 foundation/request 内出现。
  {
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/foundation/request/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'axios', message: '只允许 foundation/request 内部使用 axios。' }],
        },
      ],
    },
  },
  // SafeHtml 是唯一允许使用 v-html 的组件，其余业务/地基代码一律禁止裸 v-html。
  {
    files: ['src/security/SafeHtml.vue'],
    rules: {
      'vue/no-v-html': 'off',
    },
  },
  {
    plugins: { prettier: eslintPluginPrettier },
    rules: {
      ...eslintConfigPrettier.rules,
      'prettier/prettier': 'warn',
    },
  },
)
