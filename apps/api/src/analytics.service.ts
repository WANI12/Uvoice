import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { CaseStatus, ElectoralPhase, Prisma, ReportStatus, UserRole } from '@prisma/client';
import { AuthUser } from './auth';
import { PrismaService } from './prisma.service';

const NATIONAL_ROLES: UserRole[] = ['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR'];
const ANALYTICS_ROLES: UserRole[] = [...NATIONAL_ROLES, 'RESPONSE_OFFICER', 'EXECUTIVE'];
const OPEN_CASE_STATUSES: CaseStatus[] = [
  'OPEN', 'UNDER_VERIFICATION', 'ESCALATED', 'ACKNOWLEDGED', 'IN_PROGRESS',
  'AWAITING_INFORMATION', 'REOPENED', 'REFERRED', 'RESOLVED_PENDING_REVIEW',
];
const PHASES: ElectoralPhase[] = ['PRE_ELECTION', 'ELECTION_DAY', 'POST_ELECTION'];
const BUCKETS = ['day', 'week', 'month'] as const;
const REPORT_STATUSES: ReportStatus[] = ['SUBMITTED', 'AWAITING_TRIAGE', 'UNDER_VERIFICATION', 'VERIFIED', 'UNVERIFIED', 'INCONCLUSIVE', 'LINKED_TO_CASE'];

export type AnalyticsFilters = {
  from?: string;
  to?: string;
  phase?: string;
  state?: string;
  county?: string;
  bucket?: string;
};

function parseDateFilter(value: string, endOfDay = false) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly && endOfDay ? `${value}T23:59:59.999Z` : value);
  if (Number.isNaN(date.getTime()) || (dateOnly && date.toISOString().slice(0, 10) !== value)) {
    throw new BadRequestException('Provide valid ISO 8601 reporting dates.');
  }
  return date;
}

export function parseAnalyticsRange(filters: AnalyticsFilters, now = new Date()) {
  const filterValues = [filters.from, filters.to, filters.phase, filters.state, filters.county, filters.bucket];
  if (filterValues.some(value => value !== undefined && typeof value !== 'string')) {
    throw new BadRequestException('Analytics filters must be single text values.');
  }
  const end = filters.to ? parseDateFilter(filters.to, true) : now;
  const start = filters.from ? parseDateFilter(filters.from) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new BadRequestException('Provide a valid reporting period with start before end.');
  }
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new BadRequestException('Analytics reporting periods cannot exceed 366 days.');
  }
  if (filters.phase && !PHASES.includes(filters.phase as ElectoralPhase)) {
    throw new BadRequestException('Select a valid electoral phase.');
  }
  if (filters.bucket && !BUCKETS.includes(filters.bucket as typeof BUCKETS[number])) {
    throw new BadRequestException('Select a daily, weekly, or monthly trend interval.');
  }
  if (filters.county && !filters.state) {
    throw new BadRequestException('Select a state when filtering by county.');
  }
  if ([filters.state, filters.county].some(value => value && (value.length > 100 || value.trim() !== value))) {
    throw new BadRequestException('State and county filters must be trimmed values no longer than 100 characters.');
  }
  return { start, end };
}

function activeAssignmentFilter(userId: string, organizationIds: string[]): Prisma.CaseAssignmentWhereInput {
  return {
    OR: [
      { userId },
      ...(organizationIds.length ? [{ organizationId: { in: organizationIds } }] : []),
    ],
  };
}

function roleReportWhere(user: AuthUser, organizationIds: string[] = []): Prisma.ReportWhereInput {
  if (user.role !== 'RESPONSE_OFFICER') return {};
  return {
    caseLinks: {
      some: {
        electionCase: {
          assignments: { some: { ...activeAssignmentFilter(user.id, organizationIds), active: true } },
        },
      },
    },
  };
}

function assignmentSql(userId: string, organizationIds: string[]) {
  const clauses = [Prisma.sql`ca."userId" = ${userId}::uuid`];
  if (organizationIds.length) {
    clauses.push(Prisma.sql`ca."organizationId" IN (${Prisma.join(organizationIds.map(id => Prisma.sql`${id}::uuid`))})`);
  }
  return Prisma.sql`(${Prisma.join(clauses, ' OR ')})`;
}

function groupByBucket(bucket: string, start: Date, end: Date, phase?: string, state?: string, county?: string, responseUserId?: string, organizationIds: string[] = []) {
  const conditions = [
    Prisma.sql`r."submittedAt" >= ${start}`,
    Prisma.sql`r."submittedAt" <= ${end}`,
  ];
  if (phase) conditions.push(Prisma.sql`r."phase" = ${phase}::"ElectoralPhase"`);
  if (state) conditions.push(Prisma.sql`r."stateCode" = ${state}`);
  if (county) conditions.push(Prisma.sql`r."countyCode" = ${county}`);
  if (responseUserId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "CaseReport" cr
      JOIN "CaseAssignment" ca ON ca."caseId" = cr."caseId"
      WHERE cr."reportId" = r."id" AND ca."active" = TRUE AND ${assignmentSql(responseUserId, organizationIds)}
    )`);
  }
  const truncation = bucket === 'week' ? 'week' : bucket === 'month' ? 'month' : 'day';
  return Prisma.sql`
    SELECT date_trunc(${truncation}, r."submittedAt") AS period, COUNT(*)::bigint AS count
    FROM "Report" r
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY 1
    ORDER BY 1
  `;
}

function warningTrendQuery(bucket: string, start: Date, end: Date, phase?: string, state?: string, county?: string, responseUserId?: string, organizationIds: string[] = []) {
  const conditions = [
    Prisma.sql`wa."createdAt" >= ${start}`,
    Prisma.sql`wa."createdAt" <= ${end}`,
  ];
  if (state) conditions.push(Prisma.sql`wa."stateCode" = ${state}`);
  if (county) conditions.push(Prisma.sql`wa."countyCode" = ${county}`);
  if (phase) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "CaseReport" cr
      JOIN "Report" r ON r."id" = cr."reportId"
      WHERE cr."caseId" = wa."caseId" AND r."phase" = ${phase}::"ElectoralPhase"
    )`);
  }
  if (responseUserId) {
    conditions.push(Prisma.sql`wa."caseId" IN (
      SELECT ca."caseId" FROM "CaseAssignment" ca
      WHERE ca."active" = TRUE AND ${assignmentSql(responseUserId, organizationIds)}
    )`);
  }
  const truncation = bucket === 'week' ? 'week' : bucket === 'month' ? 'month' : 'day';
  return Prisma.sql`
    SELECT date_trunc(${truncation}, wa."createdAt") AS period, COUNT(*)::bigint AS count
    FROM "EarlyWarningAlert" wa
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY 1
    ORDER BY 1
  `;
}

function stateRiskQuery(start: Date, end: Date, phase?: string, state?: string, county?: string, responseUserId?: string, organizationIds: string[] = []) {
  const conditions = [
    Prisma.sql`r."submittedAt" >= ${start}`,
    Prisma.sql`r."submittedAt" <= ${end}`,
    Prisma.sql`r."stateCode" IS NOT NULL`,
  ];
  if (phase) conditions.push(Prisma.sql`r."phase" = ${phase}::"ElectoralPhase"`);
  if (state) conditions.push(Prisma.sql`r."stateCode" = ${state}`);
  if (county) conditions.push(Prisma.sql`r."countyCode" = ${county}`);
  if (responseUserId) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "CaseAssignment" ca
      WHERE ca."caseId" = ec."id" AND ca."active" = TRUE AND ${assignmentSql(responseUserId, organizationIds)}
    )`);
  }
  return Prisma.sql`
    SELECT r."stateCode" AS state, ec."riskLevel" AS "riskLevel", COUNT(DISTINCT ec."id")::bigint AS count
    FROM "Report" r
    JOIN "CaseReport" cr ON cr."reportId" = r."id"
    JOIN "ElectionCase" ec ON ec."id" = cr."caseId"
    WHERE ${Prisma.join(conditions, ' AND ')}
    GROUP BY r."stateCode", ec."riskLevel"
    ORDER BY r."stateCode", ec."riskLevel"
  `;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: PrismaService) {}

  async overview(user: AuthUser, filters: AnalyticsFilters = {}) {
    if (!ANALYTICS_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException('You are not authorised to access situation-room analytics.');
    }
    const { start, end } = parseAnalyticsRange(filters);
    const bucket = filters.bucket || (end.getTime() - start.getTime() > 90 * 24 * 60 * 60 * 1000 ? 'month' : 'day');
    const memberships = user.role === 'RESPONSE_OFFICER'
      ? await this.db.organizationMembership.findMany({ where: { userId: user.id, active: true }, select: { organizationId: true } })
      : [];
    const organizationIds = memberships.map(membership => membership.organizationId);
    const reportWhere: Prisma.ReportWhereInput = {
      submittedAt: { gte: start, lte: end },
      ...(filters.phase ? { phase: filters.phase as ElectoralPhase } : {}),
      ...(filters.state ? { stateCode: filters.state } : {}),
      ...(filters.county ? { countyCode: filters.county } : {}),
      ...roleReportWhere(user, organizationIds),
    };
    const caseWhere: Prisma.ElectionCaseWhereInput = {
      reports: { some: { report: reportWhere } },
      ...(user.role === 'RESPONSE_OFFICER'
        ? { assignments: { some: { ...activeAssignmentFilter(user.id, organizationIds), active: true } } }
        : {}),
    };
    const unresolvedCaseWhere = { ...caseWhere, status: { in: OPEN_CASE_STATUSES } };
    const assignedWhere: Prisma.CaseAssignmentWhereInput = {
      assignedAt: { gte: start, lte: end },
      active: true,
      electionCase: {
        reports: { some: { report: reportWhere } },
        ...(user.role === 'RESPONSE_OFFICER' ? { assignments: { some: { ...activeAssignmentFilter(user.id, organizationIds), active: true } } } : {}),
      },
      ...(user.role === 'RESPONSE_OFFICER' ? activeAssignmentFilter(user.id, organizationIds) : {}),
    };
    const periodCaseWhere = { ...caseWhere, createdAt: { gte: start, lte: end } };
    const [
      reportsReceived,
      verifiedReports,
      criticalIncidents,
      openCases,
      reportsByPhase,
      reportsByStatus,
      reportsByState,
      reportsByCounty,
      stateRiskRows,
      trendRows,
      assignments,
      periodCases,
      closedCases,
      warningTrend,
    ] = await Promise.all([
      this.db.report.count({ where: reportWhere }),
      this.db.report.count({ where: { ...reportWhere, status: 'VERIFIED' } }),
      this.db.electionCase.count({ where: { ...unresolvedCaseWhere, riskLevel: 'CRITICAL' } }),
      this.db.electionCase.count({ where: unresolvedCaseWhere }),
      this.db.report.groupBy({ by: ['phase'], where: reportWhere, _count: { _all: true }, orderBy: { phase: 'asc' } }),
      this.db.report.groupBy({ by: ['status'], where: reportWhere, _count: { _all: true }, orderBy: { status: 'asc' } }),
      this.db.report.groupBy({ by: ['stateCode'], where: reportWhere, _count: { _all: true }, orderBy: { _count: { id: 'desc' } }, take: 20 }),
      this.db.report.groupBy({ by: ['stateCode', 'countyCode'], where: { ...reportWhere, AND: [{ stateCode: { not: null } }, { countyCode: { not: null } }] }, _count: { _all: true }, orderBy: { _count: { id: 'desc' } }, take: 30 }),
      this.db.$queryRaw<Array<{ state: string; riskLevel: string; count: bigint }>>(stateRiskQuery(start, end, filters.phase, filters.state, filters.county, user.role === 'RESPONSE_OFFICER' ? user.id : undefined, organizationIds)),
      this.db.$queryRaw<Array<{ period: Date; count: bigint }>>(groupByBucket(bucket, start, end, filters.phase, filters.state, filters.county, user.role === 'RESPONSE_OFFICER' ? user.id : undefined, organizationIds)),
      this.db.caseAssignment.findMany({
        where: assignedWhere,
        select: {
          assignedAt: true,
          acknowledgedAt: true,
          dueAt: true,
          organization: { select: { name: true } },
          electionCase: { select: { status: true } },
        },
        take: 5000,
      }),
      this.db.electionCase.count({ where: periodCaseWhere }),
      this.db.electionCase.count({ where: { ...periodCaseWhere, status: 'CLOSED' } }),
      this.db.$queryRaw<Array<{ period: Date; count: bigint }>>(warningTrendQuery(bucket, start, end, filters.phase, filters.state, filters.county, user.role === 'RESPONSE_OFFICER' ? user.id : undefined, organizationIds)),
    ]);

    const now = new Date();
    const acknowledgedAssignments = assignments.filter(item => item.acknowledgedAt);
    const averageResponseHours = acknowledgedAssignments.length
      ? Number((acknowledgedAssignments.reduce((total, item) => total + ((item.acknowledgedAt!.getTime() - item.assignedAt.getTime()) / 3_600_000), 0) / acknowledgedAssignments.length).toFixed(1))
      : null;
    const overdueAssignments = assignments.filter(item => item.dueAt && item.dueAt < now && !['CLOSED', 'RESOLVED_PENDING_REVIEW'].includes(item.electionCase.status)).length;
    const institutionMap = new Map<string, { assigned: number; acknowledged: number; resolved: number; overdue: number }>();
    for (const assignment of assignments) {
      const name = assignment.organization?.name || 'Direct officer assignments';
      const value = institutionMap.get(name) || { assigned: 0, acknowledged: 0, resolved: 0, overdue: 0 };
      value.assigned += 1;
      if (assignment.acknowledgedAt) value.acknowledged += 1;
      if (assignment.electionCase.status === 'CLOSED') value.resolved += 1;
      if (assignment.dueAt && assignment.dueAt < now && !['CLOSED', 'RESOLVED_PENDING_REVIEW'].includes(assignment.electionCase.status)) value.overdue += 1;
      institutionMap.set(name, value);
    }

    const priorityIncidents = await this.db.electionCase.findMany({
      where: { ...unresolvedCaseWhere, riskLevel: { in: ['CRITICAL', 'HIGH'] } },
      select: {
        reference: true, riskLevel: true, status: true, updatedAt: true,
        reports: { take: 1, select: { report: { select: { reference: true, category: true, stateCode: true, countyCode: true, phase: true, status: true } } } },
      },
      orderBy: [{ riskLevel: 'desc' }, { updatedAt: 'asc' }],
      take: 20,
    });

    return {
      generatedAt: now.toISOString(),
      reportingPeriod: { from: start.toISOString(), to: end.toISOString(), bucket },
      filters: { phase: filters.phase || null, state: filters.state || null, county: filters.county || null },
      metrics: {
        reportsReceived,
        criticalIncidents,
        openCases,
        verifiedReports,
        unverifiedReports: reportsByStatus.find(row => row.status === 'UNVERIFIED')?._count._all ?? 0,
        inconclusiveReports: reportsByStatus.find(row => row.status === 'INCONCLUSIVE')?._count._all ?? 0,
        responseHoursToAcknowledgement: averageResponseHours,
        overdueAssignments,
        resolutionRate: periodCases ? Number((closedCases / periodCases * 100).toFixed(1)) : 0,
      },
      reportsByPhase: reportsByPhase.map(row => ({ phase: row.phase, count: row._count._all })),
      verification: REPORT_STATUSES.map(status => ({
        status,
        count: reportsByStatus.find(row => row.status === status)?._count._all ?? 0,
      })),
      geographic: {
        states: reportsByState.map(row => ({ state: row.stateCode, count: row._count._all })),
        counties: reportsByCounty.map(row => ({ state: row.stateCode, county: row.countyCode, count: row._count._all })),
        riskByState: stateRiskRows
          .map(row => ({ state: row.state, riskLevel: row.riskLevel, count: Number(row.count) }))
          .sort((left, right) => right.count - left.count),
      },
      reportTrend: trendRows.map(row => ({ period: row.period.toISOString(), count: Number(row.count) })),
      earlyWarningTrend: warningTrend.map(row => ({ period: row.period.toISOString(), count: Number(row.count) })),
      responsePerformance: {
        averageHoursToAcknowledgement: averageResponseHours,
        overdueAssignments,
        resolutionRate: periodCases ? Number((closedCases / periodCases * 100).toFixed(1)) : 0,
        institutions: [...institutionMap.entries()].map(([institution, stats]) => ({ institution, ...stats })).sort((a, b) => b.assigned - a.assigned),
      },
      priorityIncidents: priorityIncidents.map(item => ({
        caseReference: item.reference,
        riskLevel: item.riskLevel,
        status: item.status,
        updatedAt: item.updatedAt,
        report: item.reports[0]?.report ? {
          reference: item.reports[0].report.reference,
          category: item.reports[0].report.category,
          state: item.reports[0].report.stateCode,
          county: item.reports[0].report.countyCode,
          phase: item.reports[0].report.phase,
          verificationStatus: item.reports[0].report.status,
        } : null,
      })),
    };
  }

  async executive(user: AuthUser, filters: AnalyticsFilters = {}) {
    if (!['ADMIN', 'SUPERVISOR', 'ANALYST', 'EXECUTIVE'].includes(user.role)) {
      throw new ForbiddenException('Executive intelligence is restricted to authorised decision-makers.');
    }
    const analytics = await this.overview(user, filters);
    const recommendations = await this.db.executiveRecommendation.findMany({
      where: {
        status: 'APPROVED',
        AND: [
          ...(filters.state ? [{ OR: [{ stateCode: null }, { stateCode: filters.state }] }] : []),
          ...(filters.county ? [{ OR: [{ countyCode: null }, { countyCode: filters.county }] }] : []),
        ],
      },
      select: { title: true, rationale: true, action: true, stateCode: true, countyCode: true, reviewedAt: true },
      orderBy: { reviewedAt: 'desc' },
      take: 20,
    });
    const {
      reportsByPhase, geographic, reportTrend, earlyWarningTrend,
      responsePerformance, priorityIncidents, metrics, reportingPeriod, generatedAt,
    } = analytics;
    return {
      generatedAt,
      reportingPeriod,
      metrics,
      reportsByPhase,
      geographic,
      reportTrend,
      earlyWarningTrend,
      responsePerformance,
      priorityIncidents,
      approvedRecommendations: recommendations,
      limitations: [
        'Aggregates reflect reports recorded in UVoice for the selected period and filters.',
        'Unverified reports and automated alerts are signals for review, not confirmed findings.',
        'Administrative locations may be missing or inconsistent; geographic comparisons cover records with reported locations.',
      ],
    };
  }
}
