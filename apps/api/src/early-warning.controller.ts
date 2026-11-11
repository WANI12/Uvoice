import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EarlyWarningStatus } from '@prisma/client';
import { AuthGuard, AuthUser, CurrentUser } from './auth';
import { EarlyWarningService } from './early-warning.service';

const WARNING_VIEW_ROLES = ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR'];
const WARNING_MANAGE_ROLES = ['ADMIN', 'SUPERVISOR', 'ANALYST'];

@Controller('early-warning')
@UseGuards(AuthGuard)
export class EarlyWarningController {
  constructor(private readonly warnings: EarlyWarningService) {}

  @Get('alerts')
  alerts(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    if (!WARNING_VIEW_ROLES.includes(user.role)) {
      throw new ForbiddenException('Early-warning alerts are restricted to authorised analysts and supervisors.');
    }
    if (status && !Object.values(EarlyWarningStatus).includes(status as EarlyWarningStatus)) {
      throw new BadRequestException('Invalid early-warning status filter.');
    }
    return this.warnings.listAlerts(user, status as EarlyWarningStatus | undefined);
  }

  @Post('run')
  run(@CurrentUser() user: AuthUser) {
    if (!['ADMIN', 'SUPERVISOR'].includes(user.role)) {
      throw new ForbiddenException('Only supervisors and administrators can manually run the warning assessment.');
    }
    return this.warnings.runCycle();
  }

  @Get('bulletins/:period')
  bulletin(@Param('period') period: string, @CurrentUser() user: AuthUser) {
    if (!WARNING_VIEW_ROLES.includes(user.role)) {
      throw new ForbiddenException('Situation bulletins are restricted to authorised operational roles.');
    }
    if (period !== 'daily' && period !== 'weekly') {
      throw new BadRequestException('Select a daily or weekly bulletin period.');
    }
    return this.warnings.getOrGenerateBulletin(period, user);
  }

  @Post('bulletins/:period/generate')
  generateBulletin(@Param('period') period: string, @CurrentUser() user: AuthUser) {
    if (!WARNING_VIEW_ROLES.includes(user.role)) {
      throw new ForbiddenException('Situation bulletins are restricted to authorised operational roles.');
    }
    if (period !== 'daily' && period !== 'weekly') {
      throw new BadRequestException('Select a daily or weekly bulletin period.');
    }
    return this.warnings.generateBulletin(period, user);
  }

  @Post('alerts/:id/acknowledge')
  async acknowledge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    this.assertCanManage(user);
    return this.warnings.acknowledge(id, user);
  }

  @Post('alerts/:id/dismiss')
  async dismiss(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() user: AuthUser) {
    this.assertCanManage(user);
    if (!body?.reason || body.reason.trim().length < 10) {
      throw new ForbiddenException('Provide a dismissal reason of at least 10 characters.');
    }
    return this.warnings.acknowledge(id, user, true, body.reason.trim());
  }

  private assertCanManage(user: AuthUser) {
    if (!WARNING_MANAGE_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only authorised analysts and supervisors can manage warning alerts.');
    }
  }
}
