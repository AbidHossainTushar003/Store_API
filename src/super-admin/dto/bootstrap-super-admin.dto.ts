import { IsString, Matches, MaxLength } from 'class-validator';

export class BootstrapSuperAdminDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/)
  @MaxLength(128)
  token!: string;
}
