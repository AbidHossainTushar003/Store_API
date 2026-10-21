import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CartItemDto {
  @IsString()
  @Matches(/^[a-z0-9-]{1,80}$/)
  productId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;
}
