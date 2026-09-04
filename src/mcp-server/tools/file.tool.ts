/**
 * 文件操作工具
 * 用于读取和写入项目目录下的文件
 *
 * 功能：
 * - 读取文件内容（限制文件大小）
 * - 追加写入文件内容
 * - 安全检查：防止目录穿越攻击
 *
 * 安全措施：
 * - 只能访问项目根目录下的文件
 * - 限制单次读取文件大小（最大 100KB）
 * - 大文件只返回前 2000 字符
 */

import * as fs from 'fs';
import * as path from 'path';

// 安全根目录（只允许读写这个目录下的文件）
// 防止用户通过 ../../../etc/passwd 访问系统敏感文件
const SAFE_ROOT = process.cwd();

/**
 * 解析并验证安全的文件路径
 * @param filePath 用户传入的文件相对路径
 * @returns 解析后的绝对路径
 * @throws 如果路径穿越到项目目录外，抛出错误
 */
function resolveSafePath(filePath: string): string {
  // 防止路径穿越攻击（如 ../../etc/passwd）
  const resolved = path.resolve(SAFE_ROOT, filePath);
  if (!resolved.startsWith(SAFE_ROOT)) {
    throw new Error(`不允许访问项目目录外的文件：${filePath}`);
  }
  return resolved;
}

/**
 * 处理文件操作请求
 * @param operation 操作类型：'read' 读取 | 'write' 写入
 * @param args 操作参数
 * @returns 操作结果文本
 */
export async function handleFileOperation(
  operation: 'read' | 'write',
  args: any,
): Promise<string> {
  // ── 读取文件 ──
  if (operation === 'read') {
    const { path: filePath } = args;
    const fullPath = resolveSafePath(filePath);

    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
      return `文件不存在：${filePath}`;
    }

    // 获取文件信息
    const stat = fs.statSync(fullPath);

    // 检查文件大小，超过 100KB 则只返回部分内容
    if (stat.size > 100 * 1024) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      return `文件较大，只返回前 2000 字符：\n\n${content.slice(0, 2000)}\n\n...(文件共 ${stat.size} 字节)`;
    }

    // 正常读取并返回文件内容
    const content = fs.readFileSync(fullPath, 'utf-8');
    return `文件内容（${filePath}）：\n\n${content}`;
  }

  // ── 写入文件 ──
  if (operation === 'write') {
    const { path: filePath, content } = args;
    const fullPath = resolveSafePath(filePath);

    // 确保目标目录存在（如写入子目录文件）
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    // 追加写入模式（不覆盖原有内容）
    fs.appendFileSync(fullPath, content, 'utf-8');
    return `已成功写入 ${content.length} 个字符到 ${filePath}`;
  }

  // 不支持的操作类型
  throw new Error(`不支持的操作：${operation}`);
}
