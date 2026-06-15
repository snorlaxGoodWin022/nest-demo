import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class DemoService {
  // 用数组模拟数据库
  private users = [
    { id: '1', name: '林看卡', age: 30, email: 'Linkaka@example.com' },
    { id: '2', name: '小明', age: 25, email: 'xiaoming@example.com' },
  ];
  getHello() {
    return {
      message: '我是一个demo服务',
      time: new Date().toLocaleString(),
    };
  }
  createUser(dto: CreateUserDto) {
    return {
      message: '用户创建成功',
      success: true,
      data: {
        name: dto.name,
        age: dto.age,
        email: dto.email || '',
      },
    };
  }
  getUserById(id: string) {
    return {
      message: '用户查询成功',
      success: true,
      data: {
        id,
        name: '林俊杰',
        age: 18,
        email: '',
      },
    };
  }
  getList(page: number, size: number) {
    const currentPage = page || 1;
    const pageSize = size || 10;
    return {
      message: '列表查询成功',
      success: true,
      data: {
        currentPage,
        pageSize,
        total: 100,
      },
    };
  }
  updateUser(id: string, dto: CreateUserDto) {
    const userIndex = this.users.findIndex((user) => user.id === id);
    if (userIndex === -1) {
      return {
        message: `用户${id}不存在`,
        success: false,
      };
    }
    this.users[userIndex] = { ...this.users[userIndex], ...dto };

    return {
      message: `用户${id}更新成功`,
      success: true,
      data: this.users[userIndex],
    };
  }
  deleteUser(id: string) {
    const userIndex = this.users.findIndex((user) => user.id === id);
    if (userIndex === -1) {
      return {
        message: `用户${id}不存在`,
        success: false,
      };
    }
    this.users.splice(userIndex, 1);
    return {
      message: `用户${id}删除成功`,
      success: true,
    };
  }
}
