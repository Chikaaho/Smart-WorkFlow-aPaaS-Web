import { writeFileSync } from 'node:fs'
import openapiTS, { astToString } from 'openapi-typescript'

// TODO(skeleton): 未接入真实后端 Swagger 文档前，本脚本不会生成任何类型。
// 接入方式：SWAGGER_URL=http://<backend-host>/v3/api-docs pnpm gen:api-types
const source = process.env.SWAGGER_URL

if (!source) {
  console.error(
    '[gen-api-types] 未设置 SWAGGER_URL，已跳过生成。\n' +
      '请在拿到后端 Swagger/OpenAPI 文档地址后执行：\n' +
      '  SWAGGER_URL=http://<backend-host>/v3/api-docs pnpm gen:api-types',
  )
  process.exit(1)
}

const ast = await openapiTS(new URL(source))
const contents = astToString(ast)
writeFileSync(new URL('../src/contracts/api-types/schema.d.ts', import.meta.url), contents)
console.log(`[gen-api-types] 已从 ${source} 生成 src/contracts/api-types/schema.d.ts`)
