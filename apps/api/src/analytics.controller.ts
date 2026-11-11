import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { RecommendationStatus, UserRole } from '@prisma/client';
import { Response } from 'express';
import { AuthGuard, AuthUser, CurrentUser } from './auth';
import { AnalyticsFilters, AnalyticsService, parseAnalyticsRange } from './analytics.service';
import { PrismaService } from './prisma.service';

const RECOMMENDATION_ROLES: UserRole[] = ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR', 'EXECUTIVE'];
const REVIEW_ROLES: UserRole[] = ['ADMIN', 'SUPERVISOR', 'ANALYST'];
const AUTHOR_ROLES: UserRole[] = ['ADMIN', 'SUPERVISOR', 'ANALYST'];
const REPORT_KINDS = ['daily', 'weekly', 'monthly', 'state', 'county', 'critical', 'response'];

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function asCsv(rows: unknown[][]) {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

@Controller('analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService, private readonly db: PrismaService) {}

  @Get('overview')
  overview(@Query() filters: AnalyticsFilters, @CurrentUser() user: AuthUser) {
    return this.analytics.overview(user, filters);
  }

  @Get('executive')
  executive(@Query() filters: AnalyticsFilters, @CurrentUser() user: AuthUser) {
    return this.analytics.executive(user, filters);
  }

  @Get('recommendations')
  async recommendations(@CurrentUser() user: AuthUser) {
    if (!RECOMMENDATION_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException('You are not authorised to view strategic recommendations.');
    }
    return this.db.executiveRecommendation.findMany({
      where: user.role === 'EXECUTIVE' ? { status: 'APPROVED' } : {},
      include: {
        createdBy: { select: { displayName: true, role: true } },
        reviewedBy: { select: { displayName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('recommendations')
  async createRecommendation(@Body() body: Record<string, unknown>, @CurrentUser() user: AuthUser) {
    if (!AUTHOR_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException('Only analysts and supervisors can submit strategic recommendations.');
    }
    const title = String(body.title || '').trim();
    const rationale = String(body.rationale || '').trim();
    const action = String(body.action || '').trim();
    const stateCode = body.stateCode ? String(body.stateCode).trim() : null;
    const countyCode = body.countyCode ? String(body.countyCode).trim() : null;
    if (title.length < 5 || title.length > 200 || rationale.length < 20 || rationale.length > 4000 || action.length < 10 || action.length > 2000) {
      throw new BadRequestException('Provide a 5–200 character title, rationale of 20–4,000 characters, and proposed action of 10–2,000 characters.');
    }
    if (countyCode && !stateCode) throw new BadRequestException('A county-specific recommendation must include its state.');
    return this.db.$transaction(async tx => {
      const recommendation = await tx.executiveRecommendation.create({
        data: { title, rationale, action, stateCode, countyCode, createdById: user.id },
      });
      await tx.auditEvent.create({
        data: { actorId: user.id, action: 'EXECUTIVE_RECOMMENDATION_SUBMITTED', entityType: 'ExecutiveRecommendation', entityId: recommendation.id },
      });
      return recommendation;
    });
  }

  @Patch('recommendations/:id/review')
  async reviewRecommendation(
    @Param('id') id: string,
    @Body() body: { decision?: string; notes?: string },
    @CurrentUser() user: AuthUser,
  ) {
    if (!REVIEW_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException('Only analysts and supervisors can review strategic recommendations.');
    }
    if (!['APPROVED', 'REJECTED'].includes(body.decision || '')) {
      throw new BadRequestException('Choose APPROVED or REJECTED as the review decision.');
    }
    const notes = String(body.notes || '').trim();
    if (notes.length < 10 || notes.length > 2000) {
      throw new BadRequestException('Provide review notes of 10–2,000 characters.');
    }
    const recommendation = await this.db.executiveRecommendation.findUnique({ where: { id } });
    if (!recommendation) throw new BadRequestException('Strategic recommendation not found.');
    if (recommendation.createdById === user.id) {
      throw new ForbiddenException('A recommendation must be reviewed by someone other than its author.');
    }
    if (recommendation.status !== 'PENDING') {
      throw new BadRequestException('Only pending recommendations can be reviewed.');
    }
    const decision = body.decision as RecommendationStatus;
    return this.db.$transaction(async tx => {
      const updated = await tx.executiveRecommendation.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: decision, reviewNotes: notes, reviewedById: user.id, reviewedAt: new Date() },
      });
      if (updated.count !== 1) throw new BadRequestException('Only pending recommendations can be reviewed.');
      const result = await tx.executiveRecommendation.findUniqueOrThrow({ where: { id } });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: `EXECUTIVE_RECOMMENDATION_${decision}`,
          entityType: 'ExecutiveRecommendation',
          entityId: id,
          metadata: { reviewNotes: notes },
        },
      });
      return result;
    });
  }

  @Get('reports/:kind')
  async downloadReport(
    @Param('kind') kind: string,
    @Query() filters: AnalyticsFilters,
    @CurrentUser() user: AuthUser,
    @Res() response: Response,
  ) {
    if (!REPORT_KINDS.includes(kind)) {
      throw new BadRequestException(`Report type must be one of: ${REPORT_KINDS.join(', ')}.`);
    }
    if (kind === 'state' && !filters.state) throw new BadRequestException('Select a state for a state situation report.');
    if (kind === 'county' && (!filters.state || !filters.county)) throw new BadRequestException('Select a state and county for a county situation report.');
    const now = new Date();
    let start = filters.from ? new Date(filters.from) : new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    if (!filters.from && kind === 'daily') start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (!filters.from && kind === 'weekly') {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    }
    if (!filters.from && kind === 'monthly') start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const reportFilters = { ...filters, from: start.toISOString(), to: filters.to || now.toISOString() };
    if (kind === 'state') reportFilters.county = undefined;
    const range = parseAnalyticsRange(reportFilters);
    const analytics = await this.analytics.overview(user, {
      ...reportFilters,
      bucket: filters.bucket || (range.end.getTime() - range.start.getTime() > 90 * 24 * 60 * 60 * 1000 ? 'month' : 'day'),
    });
    const title = {
      daily: 'Daily National Election Situation Report',
      weekly: 'Weekly Conflict and Election Early Warning Bulletin',
      monthly: 'Monthly National Election Risk Assessment',
      state: `State Situation Report · ${filters.state}`,
      county: `County Situation Report · ${filters.county}, ${filters.state}`,
      critical: 'Critical Incident Briefing Notes',
      response: 'Election Response Performance Report',
    }[kind]!;
    const rows: unknown[][] = [
      ['UVoice', title],
      ['Reporting period', analytics.reportingPeriod.from, analytics.reportingPeriod.to],
      ['Generated at', analytics.generatedAt],
      ['Data sources', 'UVoice reports, verification records, case management, assignments and early-warning alerts in PostgreSQL'],
      ['Verification status', 'Report totals are separated by verification status; unverified and inconclusive reports are not treated as confirmed.'],
      ['Methodology', 'Aggregated database records filtered by submission/assignment time, electoral phase and selected geography.'],
      ['Limitations', 'Missing or inconsistent location data affects geographic comparisons. Automated signals are not confirmed findings. Response time is assignment-to-acknowledgement; resolution rate uses cases created in the period.'],
      [],
      ['Indicator', 'Value'],
      ['Reports received', analytics.metrics.reportsReceived],
      ['Critical unresolved incidents', analytics.metrics.criticalIncidents],
      ['Open cases', analytics.metrics.openCases],
      ['Verified reports', analytics.metrics.verifiedReports],
      ['Unverified reports', analytics.metrics.unverifiedReports],
      ['Inconclusive reports', analytics.metrics.inconclusiveReports],
      ['Average hours to acknowledgement', analytics.metrics.responseHoursToAcknowledgement ?? 'Not available'],
      ['Overdue assignments', analytics.metrics.overdueAssignments],
      ['Resolution rate (%)', analytics.metrics.resolutionRate],
      [],
      ['Reports by electoral phase'],
      ['Phase', 'Reports'],
      ...analytics.reportsByPhase.map(item => [item.phase, item.count]),
      [],
      ['Verification outcomes'],
      ['Status', 'Reports'],
      ...analytics.verification.map(item => [item.status, item.count]),
      [],
      ['Case risk indicators by state'],
      ['State', 'Risk level', 'Cases'],
      ...analytics.geographic.riskByState.map(item => [item.state, item.riskLevel, item.count]),
      [],
      ['Early-warning trend'],
      ['Period', 'Alerts'],
      ...analytics.earlyWarningTrend.map(item => [item.period, item.count]),
    ];
    if (kind === 'critical') {
      rows.push([], ['Priority incidents'], ['Case reference', 'Risk', 'Status', 'Report reference', 'Category', 'State', 'County', 'Electoral phase', 'Verification status']);
      rows.push(...analytics.priorityIncidents
        .filter(item => item.riskLevel === 'CRITICAL')
        .map(item => [
          item.caseReference, item.riskLevel, item.status, item.report?.reference || '',
          item.report?.category || '', item.report?.state || '', item.report?.county || '',
          item.report?.phase || '', item.report?.verificationStatus || '',
        ]));
    }
    if (kind === 'response') {
      rows.push([], ['Response institution performance'], ['Institution', 'Assigned', 'Acknowledged', 'Resolved', 'Overdue']);
      rows.push(...analytics.responsePerformance.institutions.map(item => [item.institution, item.assigned, item.acknowledged, item.resolved, item.overdue]));
    }
    if (['state', 'county'].includes(kind)) {
      rows.push([], ['Geographic comparisons'], ['State', 'County', 'Reports']);
      rows.push(...analytics.geographic.counties.map(item => [item.state || '', item.county || '', item.count]));
    }

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="uvoice-${kind}-report-${range.start.toISOString().slice(0, 10)}.csv"`);
    response.send(`\uFEFF${asCsv(rows)}`);
  }
}
