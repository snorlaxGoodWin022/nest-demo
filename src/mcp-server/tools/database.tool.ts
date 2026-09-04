/**
 * 数据库查询工具
 * 用于查询用户列表，支持按姓名模糊搜索和角色过滤
 *
 * 功能：
 * - 查询所有用户
 * - 按姓名模糊搜索
 * - 按角色过滤（admin / user）
 * - 限制返回数量（默认 5 条，最大 20 条）
 *
 * 注意：
 * - MCP Server 是独立进程，需要自己初始化 Prisma Client
 * - 复用项目已有的 Prisma 生成文件
 */

import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

// MCP Server 是独立进程，需要自己初始化 Prisma
// 使用数据库连接池 + Prisma Adapter 模式
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * 处理数据库查询请求
 * @param args 查询参数
 * @returns 格式化的用户列表文本（供 LLM 阅读）
 */
export async function handleDatabaseQuery(args: any): Promise<string> {
  // 解构查询参数，并设置默认值
  const { name, role, limit = 5 } = args;

  // 构建 Prisma 查询条件
  const where: any = {};

  // 按姓名模糊搜索（不区分大小写）
  if (name) {
    where.name = { contains: name, mode: 'insensitive' };
  }

  // 按角色过滤
  if (role) {
    where.role = role;
  }

  // 执行数据库查询
  // select: 只返回需要的字段，减少数据传输
  // take: 限制返回条数，防止数据量过大
  // orderBy: 按创建时间倒序，最新用户在前
  const users = await prisma.user.findMany({
    where,
    take: Math.min(Number(limit), 20), // 最大 20 条
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // 没有查询结果
  if (!users.length) {
    return '未找到符合条件的用户';
  }

  // 格式化为易读的文本（LLM 会基于这个文本回答用户）
  // 格式：序号. 姓名（ID: xxx，邮箱: xxx，角色: xxx）
  const userList = users
    .map(
      (u, i) =>
        `${i + 1}. ${u.name}（ID: ${u.id}，邮箱: ${u.email}，角色: ${u.role}）`,
    )
    .join('\n');

  return `找到 ${users.length} 个用户：\n${userList}`;
}
