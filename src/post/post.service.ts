import { Injectable } from '@nestjs/common';
import type { Prisma } from 'src/generated/prisma/client';
import { CreatePostDto } from './dto/create-post.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostDto } from './dto/query-post.dto';

@Injectable()
export class PostService {
  constructor(private readonly prisma: PrismaService) {}
  async create(createPostDto: CreatePostDto) {
    const post = await this.prisma.post.create({
      data: {
        title: createPostDto.title,
        content: createPostDto.content,
        published: createPostDto.published ?? false,
        authorId: createPostDto.authorId,
      },
    });
    return { success: true, message: 'Post created successfully', data: post };
  }
  async findAll() {
    const posts = await this.prisma.post.findMany({
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      success: true,
      message: 'Posts retrieved successfully',
      length: posts.length,
      data: posts,
    };
  }
  async getPost(id: number) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        published: true,
      },
    });
    if (!post) {
      return {
        success: false,
        message: '文章不存在',
      };
    }
    return {
      success: true,
      message: 'Post retrieved successfully',
      data: post,
    };
  }
  async deletePost(id: number) {
    const post = await this.prisma.post.delete({ where: { id } });
    if (!post) {
      return {
        success: false,
        message: `文章${id}不存在`,
      };
    }
    return { success: true, message: 'Post deleted successfully' };
  }
  async updatePost(id: number, updatePostDto: UpdatePostDto) {
    try {
      const post = await this.prisma.post.update({
        where: { id },
        data: {
          title: updatePostDto.title,
          content: updatePostDto.content,
          published: updatePostDto.published,
        },
      });
      if (!post) {
        return {
          success: false,
          message: `文章${id}不存在`,
        };
      }
      return { success: true, message: `文章${id}更新成功`, data: post };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: any) {
      return {
        success: false,
        message: `更新文章${id}时出错`,
      };
    }
  }
  async searchPosts(queryPostDto: QueryPostDto) {
    const page = Math.max(1, Number(queryPostDto.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(queryPostDto.pageSize) || 10),
    );

    // 构建过滤条件
    const where: Prisma.PostWhereInput = {};
    if (queryPostDto.title) {
      where.title = { contains: queryPostDto.title };
    }
    if (queryPostDto.published !== undefined) {
      // 处理 URL 参数传来的字符串 "true"/"false" 或 boolean
      // DTO 定义为 boolean，但 URL 参数可能是字符串
      const p = queryPostDto.published as unknown;
      where.published = p === true || p === 'true' || p === '1';
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      success: true,
      message: 'Posts retrieved successfully',
      page,
      pageSize,
      total,
      data: posts,
    };
  }
}
