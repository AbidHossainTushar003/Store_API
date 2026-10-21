import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

class HealthResponseDto {
  status: string;
  service: string;
  timestamp: string;
  uptimeMs: number;
}

@ApiTags('Health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Check the API status' })
  @ApiResponse({
    status: 200,
    description: 'API is running.',
    schema: {
      example: {
        status: 'ok',
        service: 'shopademia-api',
        timestamp: '2026-10-21T00:00:00.000Z',
        uptimeMs: 1234,
      },
    },
  })
  getHealth(): HealthResponseDto {
    return {
      status: 'ok',
      service: 'shopademia-api',
      timestamp: new Date().toISOString(),
      uptimeMs: Math.round(process.uptime() * 1000),
    };
  }
}
