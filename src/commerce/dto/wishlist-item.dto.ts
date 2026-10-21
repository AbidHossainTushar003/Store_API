import { IsString, Matches } from 'class-validator';

export class WishlistItemDto {
  @IsString()
  @Matches(/^[a-z0-9-]{1,80}$/)
  productId: string;
}
