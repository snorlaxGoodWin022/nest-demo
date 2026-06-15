// src/post/dto/create-post.dto.ts
export class CreatePostDto {
  title: string;
  content: string;
  published?: boolean;
  authorId: number;
}
