import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get()
  health() { return { status: 'ok', service: 'uvoice-api', version: '0.1.0', timestamp: new Date().toISOString() }; }
}
