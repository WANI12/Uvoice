import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CaseStatus, Prisma, RiskLevel, UserRole } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { AuthGuard, AuthUser, CurrentUser, isAdmin } from './auth';

const CASE_OPERATIONS_ROLES = ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR'];
const RISK_ASSESSOR_ROLES = ['ADMIN', 'SUPERVISOR', 'ANALYST', 'FIELD_VERIFIER'];
const ASSIGNABLE_USER_ROLES: UserRole[] = ['RESPONSE_OFFICER', 'FIELD_VERIFIER', 'ANALYST', 'SUPERVISOR'];
const ACTION_TYPES = ['ACTION_TAKEN', 'PROGRESS_UPDATE', 'CONTACT_ATTEMPT', 'REFERRAL', 'NOTE'];

const STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  OPEN: ['UNDER_VERIFICATION', 'ACKNOWLEDGED', 'ESCALATED'],
  UNDER_VERIFICATION: ['ACKNOWLEDGED', 'AWAITING_INFORMATION', 'IN_PROGRESS', 'ESCALATED'],
  ESCALATED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'RESOLVED_PENDING_REVIEW'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'AWAITING_INFORMATION', 'ESCALATED'],
  IN_PROGRESS: ['AWAITING_INFORMATION', 'RESOLVED_PENDING_REVIEW', 'ESCALATED'],
  AWAITING_INFORMATION: ['IN_PROGRESS', 'RESOLVED_PENDING_REVIEW', 'ESCALATED'],
  RESOLVED_PENDING_REVIEW: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'AWAITING_INFORMATION', 'RESOLVED_PENDING_REVIEW', 'ESCALATED'],
  REFERRED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'ESCALATED'],
};

@Controller('cases')
@UseGuards(AuthGuard)
export class CasesController {
  constructor(private db: PrismaService) {}

  private async allowed(caseId: string, user: AuthUser) {
    if (isAdmin(user) || CASE_OPERATIONS_ROLES.includes(user.role)) return true;
    const memberships = await this.db.organizationMembership.findMany({
      where: { userId: user.id, active: true },
      select: { organizationId: true },
    });
    const organizationIds = memberships.map(membership => membership.organizationId);
    const assignment = await this.db.caseAssignment.findFirst({
      where: {
        caseId,
        active: true,
        OR: [{ userId: user.id }, { organizationId: { in: organizationIds } }],
      },
    });
    return !!assignment;
  }

  private async requireCaseAccess(caseId: string, user: AuthUser) {
    const allowed = await this.allowed(caseId, user);
    if (!allowed) throw new ForbiddenException('You are not authorised to access this case.');
  }

  @Get('assignment-options')
  async assignmentOptions(@CurrentUser() user: AuthUser) {
    if (!isAdmin(user)) throw new ForbiddenException('Only supervisors and administrators can assign cases.');
    const [users, organizations] = await Promise.all([
      this.db.user.findMany({
        where: { status: 'ACTIVE', role: { in: ASSIGNABLE_USER_ROLES } },
        select: { id: true, displayName: true, role: true },
        orderBy: { displayName: 'asc' },
      }),
      this.db.organization.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { users, organizations };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const assignedToUser = {
      assignments: {
        some: {
          active: true,
          OR: [
            { userId: user.id },
            { organization: { memberships: { some: { userId: user.id, active: true } } } },
          ],
        },
      },
    };
    const where = CASE_OPERATIONS_ROLES.includes(user.role) ? {} : assignedToUser;
    return this.db.electionCase.findMany({
      where,
      take: 200,
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        reports: { include: { report: { select: { reference: true, phase: true, category: true, stateCode: true, countyCode: true, submittedAt: true } } } },
        assignments: {
          where: { active: true },
          include: {
            organization: { select: { name: true } },
            user: { select: { displayName: true } },
          },
        },
      },
    });
  }

  @Get(':id')
  async get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const caseRecord = await this.db.electionCase.findUnique({
      where: { id },
      include: {
        reports: {
          include: {
            report: {
              select: {
                reference: true, phase: true, category: true, description: true, occurredAt: true,
                stateCode: true, countyCode: true, locality: true, imminentThreat: true,
                sourceType: true, reporterMode: true, status: true, submittedAt: true,
                verifications: {
                  orderBy: { createdAt: 'desc' },
                  include: { reviewer: { select: { displayName: true, role: true } } },
                },
              },
            },
          },
        },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            organization: { select: { name: true } },
            user: { select: { displayName: true } },
          },
        },
        history: { orderBy: { createdAt: 'asc' } },
        actions: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { displayName: true, role: true } } },
        },
        escalations: { orderBy: { triggeredAt: 'desc' } },
      },
    });
    if (!caseRecord) throw new NotFoundException('Case not found.');
    await this.requireCaseAccess(id, user);
    return caseRecord;
  }

  @Post(':id/actions')
  async action(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    await this.requireCaseAccess(id, user);
    const caseExists = await this.db.electionCase.findUnique({ where: { id }, select: { id: true } });
    if (!caseExists) throw new NotFoundException('Case not found.');
    const actionType = String(body.actionType || '');
    const description = String(body.description || '').trim();
    if (!ACTION_TYPES.includes(actionType) || description.length < 5 || description.length > 4000) {
      throw new BadRequestException('Select a valid response action and provide a description of 5–4000 characters.');
    }
    if (!isAdmin(user) && !['RESPONSE_OFFICER', 'ORG_COORDINATOR'].includes(user.role)) {
      throw new ForbiddenException('Only supervisors or assigned response personnel can record response actions.');
    }
    return this.db.$transaction(async tx => {
      const action = await tx.caseAction.create({
        data: { caseId: id, actorId: user.id, actionType, description },
      });
      await tx.electionCase.update({ where: { id }, data: { updatedAt: new Date() } });
      return action;
    });
  }

  @Post(':id/assign')
  async assign(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    if (!isAdmin(user)) throw new ForbiddenException('Only supervisors and administrators can assign cases.');
    const caseExists = await this.db.electionCase.findUnique({ where: { id }, select: { id: true } });
    if (!caseExists) throw new NotFoundException('Case not found.');

    const userId = body.userId ? String(body.userId) : '';
    const organizationId = body.organizationId ? String(body.organizationId) : '';
    if (Boolean(userId) === Boolean(organizationId)) {
      throw new BadRequestException('Assign the case to exactly one authorised officer or organisation.');
    }
    let dueAt: Date | null = null;
    if (body.dueAt) {
      dueAt = new Date(String(body.dueAt));
      if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('Provide a valid response deadline.');
    }

    if (userId) {
      const assignee = await this.db.user.findFirst({
        where: { id: userId, status: 'ACTIVE', role: { in: ASSIGNABLE_USER_ROLES } },
        select: { id: true },
      });
      if (!assignee) throw new BadRequestException('Choose an active authorised response officer.');
    } else {
      const organization = await this.db.organization.findFirst({
        where: { id: organizationId, active: true },
        select: { id: true },
      });
      if (!organization) throw new BadRequestException('Choose an active authorised response organisation.');
    }

    return this.db.$transaction(async tx => {
      await tx.caseAssignment.updateMany({ where: { caseId: id, active: true }, data: { active: false } });
      const assignment = await tx.caseAssignment.create({
        data: { caseId: id, userId: userId || null, organizationId: organizationId || null, dueAt },
      });
      await tx.electionCase.update({ where: { id }, data: { updatedAt: new Date() } });
      await tx.caseAction.create({
        data: {
          caseId: id,
          actorId: user.id,
          actionType: 'ASSIGNED',
          description: `Case assigned${dueAt ? ` with response deadline ${dueAt.toISOString()}` : ' without a response deadline'}.`,
        },
      });
      await tx.auditEvent.create({
        data: { actorId: user.id, action: 'CASE_ASSIGNED', entityType: 'ElectionCase', entityId: id },
      });
      return assignment;
    });
  }

  @Post(':id/status')
  async status(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    await this.requireCaseAccess(id, user);
    const nextStatus = String(body.status || '') as CaseStatus;
    const reason = String(body.reason || '').trim();
    const existing = await this.db.electionCase.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Case not found.');
    if (!STATUS_TRANSITIONS[existing.status]?.includes(nextStatus)) {
      throw new BadRequestException(`Invalid case transition from ${existing.status} to ${nextStatus}.`);
    }
    const supervisorReviewRequired = ['CLOSED', 'REOPENED'].includes(nextStatus);
    if (supervisorReviewRequired && !isAdmin(user)) {
      throw new ForbiddenException('Only a supervisor or administrator can review closure or reopening.');
    }
    if (supervisorReviewRequired && reason.length < 10) {
      throw new BadRequestException('A supervisor review reason of at least 10 characters is required.');
    }
    const analystTriage = ['ANALYST', 'FIELD_VERIFIER'].includes(user.role) && nextStatus === 'UNDER_VERIFICATION';
    if (!isAdmin(user) && !analystTriage && !['RESPONSE_OFFICER', 'ORG_COORDINATOR'].includes(user.role)) {
      throw new ForbiddenException('Only supervisors or assigned response personnel can update case status.');
    }
    const updated = await this.db.$transaction(async tx => {
      const result = await tx.electionCase.update({ where: { id }, data: { status: nextStatus } });
      await tx.caseStatusHistory.create({
        data: { caseId: id, fromStatus: existing.status, toStatus: nextStatus, changedById: user.id, reason: reason || null },
      });
      await tx.caseAction.create({
        data: { caseId: id, actorId: user.id, actionType: `STATUS_${nextStatus}`, description: reason || `Status changed to ${nextStatus}.` },
      });
      await tx.auditEvent.create({
        data: { actorId: user.id, action: `CASE_${nextStatus}`, entityType: 'ElectionCase', entityId: id },
      });
      return result;
    });
    return updated;
  }

  @Post(':id/risk-assessment')
  async assessRisk(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    if (!RISK_ASSESSOR_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only authorised analysts and supervisors may assess risk.');
    }
    await this.requireCaseAccess(id, user);
    const caseRecord = await this.db.electionCase.findUnique({ where: { id } });
    if (!caseRecord) throw new NotFoundException('Case not found.');

    const severity = Number(body.severity);
    const impact = Number(body.impact);
    const credibility = Number(body.credibility ?? body.likelihood);
    const urgency = Number(body.urgency ?? body.likelihood);
    const legacyRiskInputs = body.credibility === undefined && body.urgency === undefined && body.likelihood !== undefined;
    const rationale = String(body.rationale || '').trim();
    const factors = [severity, credibility, urgency, impact];
    if (!factors.every(value => Number.isInteger(value) && value >= 1 && value <= 5) || rationale.length < 10) {
      throw new BadRequestException('Severity, credibility, urgency and impact must each be 1–5, with a rationale of at least 10 characters.');
    }

    const weightedScore = legacyRiskInputs
      ? severity * 0.4 + credibility * 0.35 + impact * 0.25
      : severity * 0.3 + credibility * 0.25 + urgency * 0.25 + impact * 0.2;
    const score = Math.round((weightedScore - 1) * 2.49 * 100) / 100;
    const riskLevel: RiskLevel = score >= 7.5 ? 'CRITICAL' : score >= 5 ? 'HIGH' : score >= 2.5 ? 'MODERATE' : 'LOW';
    const result = await this.db.$transaction(async tx => {
      const updatedCase = await tx.electionCase.update({ where: { id }, data: { riskScore: score, riskLevel } });
      await tx.caseAction.create({
        data: {
          caseId: id,
          actorId: user.id,
          actionType: 'RISK_ASSESSED',
          description: `Score ${score}/10 (${riskLevel}). Severity ${severity}/5; credibility ${credibility}/5; urgency ${urgency}/5; impact ${impact}/5. ${rationale}`,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'CASE_RISK_ASSESSED',
          entityType: 'ElectionCase',
          entityId: id,
          metadata: { score, riskLevel, severity, credibility, urgency, impact },
        },
      });
      return updatedCase;
    });
    return {
      caseId: id,
      score,
      riskLevel,
      scale: '0–9.96',
      method: legacyRiskInputs
        ? 'severity 40%, likelihood 35%, impact 25% (compatibility mode)'
        : 'severity 30%, credibility 25%, urgency 25%, impact 20%',
      case: result,
    };
  }

  @Post(':id/escalate')
  async escalate(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    if (!['ADMIN', 'SUPERVISOR', 'ANALYST', 'RESPONSE_OFFICER'].includes(user.role)) {
      throw new ForbiddenException('You are not authorised to escalate cases.');
    }
    await this.requireCaseAccess(id, user);
    const caseRecord = await this.db.electionCase.findUnique({ where: { id } });
    if (!caseRecord) throw new NotFoundException('Case not found.');
    if (caseRecord.status === 'CLOSED') throw new BadRequestException('Reopen the case before escalating it.');
    const level = Number(body.level);
    const reason = String(body.reason || '').trim();
    if (!Number.isInteger(level) || level < 1 || level > 3 || reason.length < 10) {
      throw new BadRequestException('Escalation level must be 1–3 and reason at least 10 characters.');
    }
    return this.db.$transaction(async tx => {
      const escalation = await tx.escalation.create({ data: { caseId: id, level, reason } });
      const updatedCase = await tx.electionCase.update({ where: { id }, data: { status: 'ESCALATED' } });
      await tx.caseStatusHistory.create({
        data: { caseId: id, fromStatus: caseRecord.status, toStatus: 'ESCALATED', changedById: user.id, reason: `Level ${level}: ${reason}` },
      });
      await tx.caseAction.create({
        data: { caseId: id, actorId: user.id, actionType: 'ESCALATED', description: `Level ${level}: ${reason}` },
      });
      await tx.auditEvent.create({
        data: { actorId: user.id, action: 'CASE_ESCALATED', entityType: 'ElectionCase', entityId: id, metadata: { level, reason } },
      });
      return { escalation, case: updatedCase };
    });
  }
}
