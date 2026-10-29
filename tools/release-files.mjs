import fs from 'node:fs'
import path from 'node:path'

const EXTRA = ['package.json', '.gitignore', '.gitattributes', '.github']
const TEXT_EXT = new Set(['.md', '.mjs', '.js', '.json', '.yml', '.yaml', '.txt', '.cjs', '.ts', '.html', '.css', ''])
const PLACEHOLDER_URL = /github\.com\/(?:YOUR_GITHUB_USER|<your-name>|%3cyour-name%3e)/i

export function forbiddenPath(name) {
  if (/(^|\/)(?:node_modules|\.git|\.hp-example)(?:\/|$)/i.test(name)) return '依赖、版本库或本地示例数据目录'
  if (/(^|\/)(?:.*\.)?brain\.json(?:\.|$)/i.test(name)) return '运行生成的记忆库'
  if (/(^|\/)\.env(?:\.|$)/i.test(name)) return '环境变量文件'
  if (/\.(?:zip|log|tmp)$/i.test(name)) return '压缩包、日志或临时文件'
  return ''
}
export function collectReleaseFiles(root, pkg) {
  const files = new Set()
  const visit = (rel) => {
    if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new Error('files 白名单路径无效')
    const abs = path.resolve(root, rel)
    if (!abs.startsWith(path.resolve(root) + path.sep)) throw new Error('files 白名单越出包目录')
    if (!fs.existsSync(abs)) return
    const stat = fs.lstatSync(abs)
    if (stat.isSymbolicLink()) throw new Error(`发布目录不能含符号链接：${rel}`)
    if (stat.isDirectory()) {
      if (['node_modules', '.git', '.hp-example'].includes(path.basename(abs))) return
      for (const name of fs.readdirSync(abs).sort()) visit(rel + '/' + name)
    } else if (stat.isFile()) files.add(rel.replace(/\\/g, '/'))
  }
  for (const rel of [...(pkg.files || []), ...EXTRA]) visit(rel)
  return [...files].sort()
}
export function textProblems(name, data) {
  if (!TEXT_EXT.has(path.posix.extname(name))) return []
  const problems = [], text = data.toString('utf8')
  const rules = [
    [/\b[A-Za-z]:\\Users\\[^\\\s"')<>]+/i, '本机 Windows 用户目录'],
    [/\/home\/[a-z0-9_-]+\//i, '本机 Linux 用户目录'],
    [/private:\d+/, '未脱敏的私聊空间标识'],
    [/\bsk-[A-Za-z0-9_-]{16,}/, '疑似 API key'],
    [/(?:access_token|api[_-]?key|secret)\s*[:=]\s*["'][^"'<]{12,}/i, '疑似凭据赋值'],
  ]
  text.split(/\r?\n/).forEach((line, i) => {
    if (PLACEHOLDER_URL.test(line)) problems.push(`${name}:${i + 1} 仓库地址仍是占位符`)
    for (const [rule, label] of rules) if (rule.test(line)) problems.push(`${name}:${i + 1} ${label}`)
    if (/(?:QQ|qq|uin|user_id|userid|群号|账号|私聊|空间)/.test(line)) {
      for (const match of line.matchAll(/\b\d{6,12}\b/g)) {
        if (!['86400000', '3600000', '60000', '1000', '4294967295'].includes(match[0])) problems.push(`${name}:${i + 1} 疑似未脱敏的账号数字`)
      }
    }
  })
  return problems
}
export function inspectFiles(files) {
  const problems = []
  for (const [name, data] of files) {
    const reason = forbiddenPath(name)
    if (reason) problems.push(`${name}：${reason}`)
    if (data.length > 1024 * 1024) problems.push(`${name}：单文件超过 1 MiB`)
    problems.push(...textProblems(name, data))
  }
  return problems
}
