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
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { QueryPostDto } from './dto/query-post.dto';

@Controller('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Post('create')
  create(@Body() createPostDto: CreatePostDto) {
    return this.postService.create(createPostDto);
  }
  @Get('all')
  findAll() {
    return this.postService.findAll();
  }
  @Get('getPost/:id')
  getPost(@Param('id') id: string) {
    return this.postService.getPost(parseInt(id));
  }
  @Delete('delete/:id')
  deletePost(@Param('id') id: string) {
    return this.postService.deletePost(parseInt(id));
  }
  @Put('update/:id')
  updatePost(@Param('id') id: string, @Body() updatePostDto: UpdatePostDto) {
    return this.postService.updatePost(parseInt(id), updatePostDto);
  }
  @Get('search')
  searchPosts(@Query() queryPostDto: QueryPostDto) {
    return this.postService.searchPosts(queryPostDto);
  }
}
