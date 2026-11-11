import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CaseStatus,
  EarlyWarningStatus,
  Prisma,
  RiskLevel,
  WarningChannel,
  WarningDeliveryStatus,
} from '@prisma/client';
import nodemailer from 'nodemailer';
import { PrismaService } from './prisma.service';
import { AuthUser } from './auth';

const ALERT_ROLES = ['ADMIN', 'SUPERVISOR', 'ANALYST'] as const;
const UNRESOLVED_CASE_STATUSES: CaseStatus[] = [
  'OPEN', 'UNDER_VERIFICATION', 'ESCALATED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'AWAITING_INFORMATION', 'REOPENED', 'REFERRED',
] as const;

export type PatternReport = {
  id: string;
  reference: string;
  stateCode: string | null;
  countyCode: string | null;
  category: string;
  submittedAt: Date;
};

export type IncidentPattern = {
  ruleCode: 'REPEATED_LOCATION_CATEGORY' | 'GEOGRAPHIC_CONCENTRATION';
  stateCode: string;
  countyCode: string;
  category: string | null;
  count: number;
  references: string[];
  severity: RiskLevel;
};

export function detectIncidentPatterns(
  reports: PatternReport[],
  options: { windowStart: Date; windowEnd: Date; repeatedThreshold: number; concentrationThreshold: number },
): IncidentPattern[] {
  const repeated = new Map<string, PatternReport[]>();
  const locations = new Map<string, PatternReport[]>();
  for (const report of reports) {
    if (!report.stateCode || !report.countyCode) continue;
    const locationKey = `${report.stateCode.trim().toLowerCase()}|${report.countyCode.trim().toLowerCase()}`;
    const repeatedKey = `${locationKey}|${report.category}`;
    const submittedAt = report.submittedAt.getTime();
    if (submittedAt >= options.windowStart.getTime() && submittedAt <= options.windowEnd.getTime()) {
      const repeatedItems = repeated.get(repeatedKey) ?? [];
      repeatedItems.push(report);
      repeated.set(repeatedKey, repeatedItems);
      const locationItems = locations.get(locationKey) ?? [];
      locationItems.push(report);
      locations.set(locationKey, locationItems);
    }
  }

  const patterns: IncidentPattern[] = [];
  for (const [key, items] of repeated) {
    if (items.length < options.repeatedThreshold) continue;
    const [stateCode, countyCode, category] = key.split('|');
    patterns.push({
      ruleCode: 'REPEATED_LOCATION_CATEGORY',
      stateCode: items[0].stateCode || stateCode,
      countyCode: items[0].countyCode || countyCode,
      category,
      count: items.length,
      references: items.slice(0, 10).map(item => item.reference),
      severity: items.length >= options.repeatedThreshold * 2 ? 'CRITICAL' : 'HIGH',
    });
  }
  for (const items of locations.values()) {
    if (items.length < options.concentrationThreshold) continue;
    patterns.push({
      ruleCode: 'GEOGRAPHIC_CONCENTRATION',
      stateCode: items[0].stateCode as string,
      countyCode: items[0].countyCode as string,
      category: null,
      count: items.length,
      references: items.slice(0, 10).map(item => item.reference),
      severity: items.length >= options.concentrationThreshold * 2 ? 'CRITICAL' : 'HIGH',
    });
  }
  return patterns;
}

@Injectable()
export class EarlyWarningService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EarlyWarningService.name);
  private readonly transporter = process.env.SMTP_HOST && process.env.SMTP_FROM
    ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    })
    : null;
  private timer: NodeJS.Timeout | undefined;
  private startupTimer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly db: PrismaService) {}

  onModuleInit() {
    const interval = this.numberSetting('EARLY_WARNING_INTERVAL_MS', 60_000, 15_000, 3_600_000);
    this.timer = setInterval(() => {
      void this.runCycle().catch(error => this.logger.error('Scheduled early-warning cycle failed.', error instanceof Error ? error.stack : String(error)));
    }, interval);
    this.timer.unref();
    this.startupTimer = setTimeout(() => {
      void this.runCycle().catch(error => this.logger.error('Initial early-warning cycle failed.', error instanceof Error ? error.stack : String(error)));
    }, 5_000).unref();
    if (!this.transporter) this.logger.warn('SMTP is not configured; early warnings will be available in-app only.');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }

  async runCycle() {
    if (this.running) return { alreadyRunning: true, alertsCreated: 0 };
    this.running = true;
    let alertsCreated = 0;
    try {
      const now = new Date();
      const windowHours = this.numberSetting('EARLY_WARNING_WINDOW_HOURS', 24, 1, 168);
      const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
      const reports = await this.db.report.findMany({
        where: { submittedAt: { gte: windowStart, lte: now } },
        select: { id: true, reference: true, stateCode: true, countyCode: true, category: true, submittedAt: true },
        orderBy: { submittedAt: 'desc' },
        take: 5000,
      });
      if (reports.length === 5000) this.logger.warn('Early-warning scan reached the 5,000-report analysis limit.');

      const patterns = detectIncidentPatterns(reports, {
        windowStart,
        windowEnd: now,
        repeatedThreshold: this.numberSetting('EARLY_WARNING_REPEAT_THRESHOLD', 3, 2, 100),
        concentrationThreshold: this.numberSetting('EARLY_WARNING_CONCENTRATION_THRESHOLD', 5, 2, 100),
      });
      const periodKey = now.toISOString().slice(0, 10);
      for (const pattern of patterns) {
        const categoryLabel = pattern.category ? ` · ${pattern.category.replaceAll('_', ' ')}` : '';
        const repeatedRule = pattern.ruleCode === 'REPEATED_LOCATION_CATEGORY';
        const title = repeatedRule ? 'Repeated incident pattern detected' : 'Geographic incident concentration detected';
        const summary = `${pattern.count} reports in ${pattern.countyCode}, ${pattern.stateCode}${categoryLabel} within the last ${windowHours} hours. This is an automated signal; check for duplicate reports and verify before taking action.`;
        const created = await this.createAlert({
          fingerprint: `${pattern.ruleCode}:${pattern.stateCode.toLowerCase()}:${pattern.countyCode.toLowerCase()}:${pattern.category || 'all'}:${periodKey}`,
          ruleCode: pattern.ruleCode,
          severity: pattern.severity,
          title,
          summary,
          stateCode: pattern.stateCode,
          countyCode: pattern.countyCode,
          category: pattern.category,
          details: { count: pattern.count, windowHours, reportReferences: pattern.references },
        });
        if (created) alertsCreated += 1;
      }

      alertsCreated += await this.scanCriticalCases();
      alertsCreated += await this.scanEscalations(now);
      alertsCreated += await this.scanMissedDeadlines(now);
      return { alreadyRunning: false, alertsCreated, scannedReports: reports.length, generatedAt: now.toISOString() };
    } finally {
      this.running = false;
    }
  }

  async listAlerts(user: AuthUser, status?: EarlyWarningStatus) {
    if (!ALERT_ROLES.includes(user.role as typeof ALERT_ROLES[number]) && user.role !== 'AUDITOR') {
      throw new ForbiddenException('Early-warning alerts are restricted to authorised operational roles.');
    }
    return this.db.earlyWarningAlert.findMany({
      where: status ? { status } : {},
      take: 200,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        _count: { select: { notifications: true } },
        acknowledgedBy: { select: { displayName: true } },
      },
    });
  }

  async acknowledge(alertId: string, user: AuthUser, dismiss = false, reason?: string) {
    if (!ALERT_ROLES.includes(user.role as typeof ALERT_ROLES[number])) {
      throw new ForbiddenException('Only authorised analysts and supervisors can manage warning alerts.');
    }
    const alert = await this.db.earlyWarningAlert.findUnique({ where: { id: alertId } });
    if (!alert) throw new NotFoundException('Warning alert not found.');
    if (alert.status !== 'OPEN') throw new BadRequestException('Only open warning alerts can be acknowledged or dismissed.');
    const status = dismiss ? 'DISMISSED' : 'ACKNOWLEDGED';
    const result = await this.db.$transaction(async tx => {
      const updated = await tx.earlyWarningAlert.updateMany({
        where: { id: alertId, status: 'OPEN' },
        data: { status, acknowledgedAt: new Date(), acknowledgedById: user.id },
      });
      if (updated.count !== 1) throw new BadRequestException('Only open warning alerts can be acknowledged or dismissed.');
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: dismiss ? 'EARLY_WARNING_DISMISSED' : 'EARLY_WARNING_ACKNOWLEDGED',
          entityType: 'EarlyWarningAlert',
          entityId: alertId,
          metadata: { ruleCode: alert.ruleCode, ...(dismiss ? { reason } : {}) },
        },
      });
      return tx.earlyWarningAlert.findUniqueOrThrow({ where: { id: alertId } });
    });
    return result;
  }

  async generateBulletin(period: 'daily' | 'weekly', user: AuthUser) {
    if (!['ADMIN', 'SUPERVISOR', 'ANALYST', 'AUDITOR'].includes(user.role)) {
      throw new ForbiddenException('You are not authorised to generate situation bulletins.');
    }
    const now = new Date();
    const periodStart = period === 'daily' ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) : this.startOfUtcWeek(now);
    const [reportTotal, categories, locations, reportStatuses, caseRisks, caseStatuses, activeAlerts] = await Promise.all([
      this.db.report.count({ where: { submittedAt: { gte: periodStart, lte: now } } }),
      this.db.report.groupBy({ by: ['category'], where: { submittedAt: { gte: periodStart, lte: now } }, _count: { _all: true }, orderBy: { _count: { id: 'desc' } }, take: 10 }),
      this.db.report.groupBy({ by: ['stateCode', 'countyCode'], where: { submittedAt: { gte: periodStart, lte: now }, stateCode: { not: null }, countyCode: { not: null } }, _count: { _all: true }, orderBy: { _count: { id: 'desc' } }, take: 10 }),
      this.db.report.groupBy({ by: ['status'], where: { submittedAt: { gte: periodStart, lte: now } }, _count: { _all: true } }),
      this.db.electionCase.groupBy({ by: ['riskLevel'], where: { createdAt: { gte: periodStart, lte: now } }, _count: { _all: true } }),
      this.db.electionCase.groupBy({ by: ['status'], where: { createdAt: { gte: periodStart, lte: now } }, _count: { _all: true } }),
      this.db.earlyWarningAlert.count({ where: { createdAt: { gte: periodStart, lte: now }, status: 'OPEN' } }),
    ]);
    const content = {
      title: `${period === 'daily' ? 'Daily' : 'Weekly'} situation bulletin`,
      period,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      generatedAt: now.toISOString(),
      summary: `${reportTotal} reports received; ${activeAlerts} active early-warning alerts generated during this period.`,
      reportCount: reportTotal,
      activeWarningCount: activeAlerts,
      topCategories: categories.filter(row => row._count._all >= 3).map(row => ({ category: row.category, count: row._count._all })),
      topLocations: locations.filter(row => row._count._all >= 3).map(row => ({ stateCode: row.stateCode, countyCode: row.countyCode, count: row._count._all })),
      reportStatuses: reportStatuses.map(row => ({ status: row.status, count: row._count._all })),
      caseRiskLevels: caseRisks.map(row => ({ riskLevel: row.riskLevel, count: row._count._all })),
      caseStatuses: caseStatuses.map(row => ({ status: row.status, count: row._count._all })),
      safeguards: [
        'Automated signals are recommendations, not confirmed findings.',
        'Review repeated-report signals for duplicates before drawing conclusions.',
        'This bulletin contains aggregate operational data and excludes reporter identity and report narratives.',
      ],
    };
    const stored = await this.db.$transaction(async tx => {
      const bulletin = await tx.earlyWarningBulletin.upsert({
        where: { period_periodStart: { period, periodStart } },
        create: {
          period,
          periodStart,
          periodEnd: now,
          generatedById: user.id,
          content: content as Prisma.InputJsonValue,
        },
        update: {
          periodEnd: now,
          generatedById: user.id,
          generatedAt: now,
          content: content as Prisma.InputJsonValue,
        },
      });
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: 'EARLY_WARNING_BULLETIN_GENERATED',
          entityType: 'EarlyWarningBulletin',
          entityId: bulletin.id,
          metadata: { period, periodStart: periodStart.toISOString() },
        },
      });
      return bulletin;
    });
    return stored;
  }

  async getOrGenerateBulletin(period: 'daily' | 'weekly', user: AuthUser) {
    const now = new Date();
    const periodStart = period === 'daily'
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : this.startOfUtcWeek(now);
    const existing = await this.db.earlyWarningBulletin.findUnique({
      where: { period_periodStart: { period, periodStart } },
    });
    return existing ?? this.generateBulletin(period, user);
  }

  private async scanCriticalCases() {
    const cases = await this.db.electionCase.findMany({
      where: {
        riskLevel: 'CRITICAL',
        status: { in: UNRESOLVED_CASE_STATUSES },
        earlyWarnings: { none: { ruleCode: 'CRITICAL_CASE' } },
      },
      select: {
        id: true,
        reference: true,
        reports: { take: 1, select: { report: { select: { stateCode: true, countyCode: true, category: true } } } },
      },
      take: 500,
    });
    let created = 0;
    for (const caseRecord of cases) {
      const report = caseRecord.reports[0]?.report;
      const alert = await this.createAlert({
        fingerprint: `CRITICAL_CASE:${caseRecord.id}`,
        ruleCode: 'CRITICAL_CASE',
        severity: 'CRITICAL',
        title: 'Critical case requires analyst review',
        summary: `Case ${caseRecord.reference} is classified critical and remains unresolved. Review the case and confirm an appropriate response.`,
        stateCode: report?.stateCode,
        countyCode: report?.countyCode,
        category: report?.category,
        caseId: caseRecord.id,
        details: { caseReference: caseRecord.reference },
      });
      if (alert) created += 1;
    }
    return created;
  }

  private async scanEscalations(now: Date) {
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const escalations = await this.db.escalation.findMany({
      where: { triggeredAt: { gte: since, lte: now } },
      select: {
        id: true,
        level: true,
        reason: true,
        electionCase: {
          select: {
            id: true,
            reference: true,
            reports: { take: 1, select: { report: { select: { stateCode: true, countyCode: true, category: true } } } },
          },
        },
      },
      take: 500,
    });
    let created = 0;
    for (const escalation of escalations) {
      const report = escalation.electionCase.reports[0]?.report;
      const alert = await this.createAlert({
        fingerprint: `ESCALATION:${escalation.id}`,
        ruleCode: 'CASE_ESCALATED',
        severity: 'CRITICAL',
        title: `Case escalation · level ${escalation.level}`,
        summary: `Case ${escalation.electionCase.reference} was escalated to level ${escalation.level}. An authorised supervisor should review the escalation.`,
        stateCode: report?.stateCode,
        countyCode: report?.countyCode,
        category: report?.category,
        caseId: escalation.electionCase.id,
        details: { caseReference: escalation.electionCase.reference, escalationLevel: escalation.level },
      });
      if (alert) created += 1;
    }
    return created;
  }

  private async scanMissedDeadlines(now: Date) {
    const assignments = await this.db.caseAssignment.findMany({
      where: {
        active: true,
        dueAt: { lte: now },
        electionCase: { riskLevel: { in: ['HIGH', 'CRITICAL'] }, status: { in: UNRESOLVED_CASE_STATUSES } },
      },
      select: {
        id: true,
        dueAt: true,
        userId: true,
        organization: {
          select: { memberships: { where: { active: true, user: { status: 'ACTIVE' } }, select: { userId: true } } },
        },
        electionCase: {
          select: {
            id: true,
            reference: true,
            riskLevel: true,
            reports: { take: 1, select: { report: { select: { stateCode: true, countyCode: true, category: true } } } },
          },
        },
      },
      take: 500,
    });
    let created = 0;
    for (const assignment of assignments) {
      if (!assignment.dueAt) continue;
      const report = assignment.electionCase.reports[0]?.report;
      const recipientIds = [
        assignment.userId,
        ...(assignment.organization?.memberships.map(membership => membership.userId) ?? []),
      ].filter((value): value is string => !!value);
      const alert = await this.createAlert({
        fingerprint: `MISSED_DEADLINE:${assignment.id}:${assignment.dueAt.toISOString()}`,
        ruleCode: 'RESPONSE_DEADLINE_MISSED',
        severity: assignment.electionCase.riskLevel,
        title: 'Response deadline missed',
        summary: `${assignment.electionCase.riskLevel} case ${assignment.electionCase.reference} remains unresolved after its assigned response deadline. A supervisor should review the delay.`,
        stateCode: report?.stateCode,
        countyCode: report?.countyCode,
        category: report?.category,
        caseId: assignment.electionCase.id,
        details: { caseReference: assignment.electionCase.reference, dueAt: assignment.dueAt.toISOString() },
      }, recipientIds);
      if (alert) created += 1;
    }
    return created;
  }

  private async createAlert(
    input: {
      fingerprint: string;
      ruleCode: string;
      severity: RiskLevel;
      title: string;
      summary: string;
      stateCode?: string | null;
      countyCode?: string | null;
      category?: string | null;
      caseId?: string | null;
      details: Prisma.InputJsonValue;
    },
    additionalRecipientIds: string[] = [],
  ) {
    let alert: Prisma.EarlyWarningAlertGetPayload<{}> & { recipients: { id: string; email: string }[] };
    try {
      alert = await this.db.$transaction(async tx => {
        const created = await tx.earlyWarningAlert.create({
          data: {
            ...input,
            stateCode: input.stateCode ?? null,
            countyCode: input.countyCode ?? null,
            category: input.category ?? null,
            caseId: input.caseId ?? null,
          },
        });
        await tx.auditEvent.create({
          data: {
            action: 'EARLY_WARNING_CREATED',
            entityType: 'EarlyWarningAlert',
            entityId: created.id,
            metadata: { ruleCode: input.ruleCode, severity: input.severity, fingerprint: input.fingerprint },
          },
        });
        const recipients = await tx.user.findMany({
          where: {
            status: 'ACTIVE',
            OR: [{ role: { in: [...ALERT_ROLES] } }, ...(additionalRecipientIds.length ? [{ id: { in: additionalRecipientIds } }] : [])],
          },
          select: { id: true, email: true },
        });
        if (recipients.length) {
          await tx.warningNotification.createMany({
            data: recipients.flatMap(recipient => [
              { alertId: created.id, recipientId: recipient.id, channel: WarningChannel.IN_APP, status: WarningDeliveryStatus.SENT, deliveredAt: new Date() },
              { alertId: created.id, recipientId: recipient.id, channel: WarningChannel.EMAIL, status: this.transporter ? WarningDeliveryStatus.FAILED : WarningDeliveryStatus.SKIPPED },
            ]),
          });
        }
        return { ...created, recipients };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
      throw error;
    }

    if (this.transporter) {
      for (const recipient of alert.recipients) {
        try {
          await this.transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: recipient.email,
            subject: `[UVoice ${input.severity}] ${input.title}`,
            text: `${input.title}\n\n${input.summary}\n\nReview and acknowledge this automated signal in the UVoice early-warning workspace. Automated alerts are not confirmed findings.`,
          });
          await this.db.warningNotification.update({
            where: { alertId_recipientId_channel: { alertId: alert.id, recipientId: recipient.id, channel: WarningChannel.EMAIL } },
            data: { status: WarningDeliveryStatus.SENT, deliveredAt: new Date(), error: null },
          });
        } catch (error) {
          const reason = error instanceof Error ? error.message.slice(0, 1000) : 'Email delivery failed.';
          await this.db.warningNotification.update({
            where: { alertId_recipientId_channel: { alertId: alert.id, recipientId: recipient.id, channel: WarningChannel.EMAIL } },
            data: { status: WarningDeliveryStatus.FAILED, error: reason },
          });
          this.logger.error(`Early-warning email delivery failed for alert ${alert.id}, recipient ${recipient.id}: ${reason}`);
        }
      }
    }
    this.logger.warn(`Early-warning alert created: ${input.ruleCode} (${input.severity}), ${input.fingerprint}`);
    return alert;
  }

  private numberSetting(name: string, fallback: number, min: number, max: number) {
    const configured = process.env[name];
    if (!configured) return fallback;
    const value = Number(configured);
    if (!Number.isInteger(value) || value < min || value > max) {
      this.logger.error(`${name} must be an integer between ${min} and ${max}; using default ${fallback}.`);
      return fallback;
    }
    return value;
  }

  private startOfUtcWeek(now: Date) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    return start;
  }
}
