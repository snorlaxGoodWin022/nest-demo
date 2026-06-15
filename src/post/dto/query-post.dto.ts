export class QueryPostDto {
  // 当前页码，不传默认第 1 页
  // URL 参数都是字符串，service 里会转成数字
  page?: string;
  // 每页显示条数，不传默认 10 条
  pageSize?: string;
  // 按标题模糊搜索，可选
  title?: string;
  published?: boolean;
}
