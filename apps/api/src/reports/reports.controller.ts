import { Body, Controller, Get, Post } from '@nestjs/common';
@Controller('reports')
export class ReportsController {
  @Get('schema')
  schema() {
    return { electoralPhases:['PRE_ELECTION','ELECTION_DAY','POST_ELECTION'], reporterModes:['IDENTIFIED','CONFIDENTIAL','ANONYMOUS'], sourceTypes:['FIRST_HAND','SECOND_HAND','OFFICIAL_STATEMENT','MEDIA_REPORT','ANALYST_ASSESSMENT'], note:'MVP contract preview. Production submission must use authentication/anonymous token policy, DTO validation, rate limits and audit logging.' };
  }
  @Post('validate-preview')
  validatePreview(@Body() body: Record<string, unknown>) {
    const required = ['electoralPhase','category','description','sourceType','reporterMode'];
    const missing = required.filter(k => !body || body[k] === undefined || body[k] === null || body[k] === '');
    return { valid: missing.length === 0, missing, note:'Preview endpoint only; it does not persist reports.' };
  }
}
