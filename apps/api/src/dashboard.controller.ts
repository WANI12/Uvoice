import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthGuard, AuthUser, CurrentUser } from './auth';

const DASHBOARD_ROLES = ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'RESPONSE_OFFICER', 'FIELD_VERIFIER', 'EXECUTIVE'];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly db: PrismaService) {}

  @Get('summary')
  @UseGuards(AuthGuard)
  async summary(@CurrentUser() user: AuthUser) {
    if (!DASHBOARD_ROLES.includes(user.role)) {
      throw new ForbiddenException('Situation-room access is restricted to authorised roles.');
    }
    const assignedRole = ['RESPONSE_OFFICER', 'FIELD_VERIFIER'].includes(user.role);
    const memberships = assignedRole
      ? await this.db.organizationMembership.findMany({ where: { userId: user.id, active: true }, select: { organizationId: true } })
      : [];
    const assignmentScope = {
      active: true,
      OR: [
        { userId: user.id },
        ...(memberships.length ? [{ organizationId: { in: memberships.map(item => item.organizationId) } }] : []),
      ],
    };
    const reportScope = assignedRole
      ? { caseLinks: { some: { electionCase: { assignments: { some: assignmentScope } } } } }
      : {};
    const caseScope = assignedRole
      ? { assignments: { some: assignmentScope } }
      : {};
    const [total, verified, open, critical, untriaged, byPhase] = await Promise.all([
      this.db.report.count({ where: reportScope }),
      this.db.report.count({ where: { ...reportScope, status: 'VERIFIED' } }),
      this.db.electionCase.count({ where: { ...caseScope, status: { notIn: ['CLOSED', 'RESOLVED_PENDING_REVIEW'] } } }),
      this.db.electionCase.count({ where: { ...caseScope, riskLevel: 'CRITICAL', status: { not: 'CLOSED' } } }),
      this.db.report.count({ where: { ...reportScope, status: 'AWAITING_TRIAGE' } }),
      this.db.report.groupBy({ by: ['phase'], where: reportScope, _count: { _all: true } }),
    ]);
    const recent = user.role === 'EXECUTIVE' ? [] : await this.db.report.findMany({
      where: reportScope,
      take: 8,
      orderBy: { submittedAt: 'desc' },
      select: { reference: true, phase: true, category: true, status: true, submittedAt: true, stateCode: true },
    });
    return {
      metrics: { totalReports: total, verifiedReports: verified, openCases: open, criticalCases: critical, awaitingTriage: untriaged },
      byPhase,
      recent,
      restrictedSummary: user.role === 'EXECUTIVE',
    };
  }
}
