import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class PlaceOrderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,32}$/)
  phone!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  address!: string;
}
