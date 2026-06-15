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
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}
  @Post('create')
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
  @Get('all')
  findAll() {
    return this.userService.findAll();
  }
  @Get('getUser/:id')
  async getUser(@Param('id') id: string) {
    return this.userService.getUser(parseInt(id));
  }
  @Delete('delete/:id')
  async deleteUser(@Param('id') id: string) {
    return this.userService.deleteUser(parseInt(id));
  }
  @Put('update/:id')
  updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.updateUser(parseInt(id), updateUserDto);
  }
  @Get('search')
  searchUser(@Query() query: QueryUserDto) {
    return this.userService.searchUser(query);
  }
}
