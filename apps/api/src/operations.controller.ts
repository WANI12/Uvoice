import { Controller, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthGuard, CurrentUser, AuthUser } from './auth';

const OPS_ROLES = ['ADMIN','SUPERVISOR','ANALYST','AUDITOR','RESPONSE_OFFICER','FIELD_VERIFIER'];
@Controller('operations')
@UseGuards(AuthGuard)
export class OperationsController {
  constructor(private db: PrismaService) {}
  private assertRole(u: AuthUser) { if (!OPS_ROLES.includes(u.role)) throw new ForbiddenException('Operational access is restricted to authorised roles.'); }

  // Privacy-preserving map feed: never returns reporter identity, description, or tracking tokens.
  @Get('map-points') async mapPoints(@CurrentUser() u: AuthUser, @Query('phase') phase?: string, @Query('state') state?: string) {
    this.assertRole(u);
    const validPhases = ['PRE_ELECTION','ELECTION_DAY','POST_ELECTION'];
    if (phase && !validPhases.includes(phase)) throw new ForbiddenException('Invalid electoral phase.');
    const reports = await this.db.report.findMany({
      where: { latitude: { not: null }, longitude: { not: null }, ...(phase ? { phase: phase as any } : {}), ...(state ? { stateCode: state } : {}) },
      take: 2000, orderBy: { submittedAt: 'desc' },
      select: { id:true, reference:true, phase:true, category:true, status:true, stateCode:true, countyCode:true, locality:true, latitude:true, longitude:true, submittedAt:true, imminentThreat:true,
        caseLinks: { select: { electionCase: { select: { riskLevel:true, riskScore:true, status:true } } } } }
    });
    return reports.map(r => ({ id:r.id, reference:r.reference, phase:r.phase, category:r.category, status:r.status, stateCode:r.stateCode, countyCode:r.countyCode, locality:r.locality, latitude:Number(r.latitude), longitude:Number(r.longitude), submittedAt:r.submittedAt, imminentThreat:r.imminentThreat, riskLevel:r.caseLinks[0]?.electionCase.riskLevel ?? (r.imminentThreat ? 'CRITICAL' : 'MODERATE'), riskScore:r.caseLinks[0]?.electionCase.riskScore ? Number(r.caseLinks[0].electionCase.riskScore) : null }));
  }

  @Get('geojson') async geoJson(@CurrentUser() u: AuthUser, @Query('phase') phase?: string, @Query('state') state?: string) {
    const points = await this.mapPoints(u, phase, state);
    return { type:'FeatureCollection', features: points.map(p => ({ type:'Feature', geometry:{type:'Point',coordinates:[p.longitude,p.latitude]}, properties:{reference:p.reference,phase:p.phase,category:p.category,status:p.status,stateCode:p.stateCode,countyCode:p.countyCode,locality:p.locality,submittedAt:p.submittedAt,riskLevel:p.riskLevel,riskScore:p.riskScore,imminentThreat:p.imminentThreat} })) };
  }

  @Get('analytics') async analytics(@CurrentUser() u: AuthUser) {
    this.assertRole(u);
    const [byState,byCategory,byRisk,byStatus,byCounty,recentTrend] = await Promise.all([
      this.db.report.groupBy({by:['stateCode'],_count:{_all:true},orderBy:{_count:{id:'desc'}}}),
      this.db.report.groupBy({by:['category'],_count:{_all:true},orderBy:{_count:{id:'desc'}}}),
      this.db.electionCase.groupBy({by:['riskLevel'],_count:{_all:true}}),
      this.db.electionCase.groupBy({by:['status'],_count:{_all:true}}),
      this.db.report.groupBy({by:['stateCode','countyCode'],_count:{_all:true},orderBy:{_count:{id:'desc'}},take:30}),
      this.db.$queryRaw<Array<{day:string; count:bigint}>>`SELECT to_char(date_trunc('day', "submittedAt"), 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count FROM "Report" WHERE "submittedAt" >= NOW() - INTERVAL '30 days' GROUP BY 1 ORDER BY 1`
    ]);
    return { generatedAt:new Date().toISOString(), byState, byCategory, byRisk, byStatus, byCounty, dailyReports:recentTrend.map(x=>({day:x.day,count:Number(x.count)})) };
  }
}
