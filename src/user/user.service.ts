import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import type { Prisma } from 'src/generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}
  async create(createUserDto: CreateUserDto) {
    const user = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: createUserDto.password,
        role: createUserDto.role || 'user',
      },
    });
    return { success: true, message: 'User created successfully', data: user };
  }
  async findAll() {
    const users = await this.prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      success: true,
      message: 'Users retrieved successfully',
      length: users.length,
      data: users,
    };
  }
  async getUser(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        posts: {
          select: { id: true, title: true, content: true, createdAt: true },
        },
      },
    });
    if (!user) {
      return {
        success: false,
        message: '用户不存在',
      };
    }
    return {
      success: true,
      message: 'User retrieved successfully',
      data: user,
    };
  }
  async deleteUser(id: number) {
    const user = await this.prisma.user.delete({ where: { id } });
    if (!user) {
      return {
        success: false,
        message: `用户${id}不存在`,
      };
    }
    return { success: true, message: 'User deleted successfully' };
  }
  async updateUser(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: updateUserDto.name,
        email: updateUserDto.email,
        password: updateUserDto.password,
        role: updateUserDto.role || 'user',
      },
    });
    return { success: true, message: `用户${id}更新成功`, data: user };
  }
  async searchUser(query: QueryUserDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Number(query.pageSize) || 10);
    const skip = (page - 1) * pageSize;

    const where: Prisma.UserWhereInput = {
      ...(query.name && { name: { contains: query.name } }),
      ...(query.role ? { role: query.role } : {}),
    };

    try {
      const [users, total] = await this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          skip,
          take: pageSize,
          select: { id: true, name: true, email: true, role: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.user.count({ where }),
      ]);

      return {
        success: true,
        message: '用户列表查询成功',
        page,
        pageSize,
        total,
        data: users,
      };
    } catch (error) {
      throw new Error(
        `用户列表查询失败: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    }
  }
}
