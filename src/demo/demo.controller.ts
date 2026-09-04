import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { DemoService } from './demo.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('demo') //路由前缀是 demo
export class DemoController {
  //demoService
  constructor(private readonly demoService: DemoService) {}

  @Get('hello') // get请求 路径是/demo/hello
  getHello() {
    return this.demoService.getHello();
  }

  @Post('user') // post请求 /demo/user
  //@Body 作用是告诉框架拿请求里的body数据
  createUser(@Body() dto: CreateUserDto) {
    return this.demoService.createUser(dto);
  }

  @Get('user/:id') //get请求 /demo/user/123
  getUserById(@Param('id') id: string) {
    return this.demoService.getUserById(id);
  }

  @Get('list')
  getList(@Query('page') page: number, @Query('size') size: number) {
    return this.demoService.getList(Number(page), Number(size));
  }

  @Put('user/:id')
  updateUser(@Param('id') id: string, @Body() dto: CreateUserDto) {
    return this.demoService.updateUser(id, dto);
  }

  @Delete('user/:id')
  deleteUser(@Param('id') id: string) {
    return this.demoService.deleteUser(id);
  }
}
