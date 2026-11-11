import { BadRequestException } from '@nestjs/common';
import { CasesController } from './cases.controller';
import { PrismaService } from './prisma.service';
import { AuthUser } from './auth';

describe('CasesController lifecycle', () => {
  const supervisor: AuthUser = {
    id: '00000000-0000-4000-8000-000000000001',
    username: 'supervisor',
    email: 'supervisor@example.test',
    role: 'SUPERVISOR',
    status: 'ACTIVE',
  };
  const analyst: AuthUser = { ...supervisor, role: 'ANALYST' };

  function makeController(status: string) {
    const tx = {
      electionCase: { update: jest.fn().mockResolvedValue({ id: 'case-1', status: 'RESOLVED_PENDING_REVIEW' }) },
      caseStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      caseAction: { create: jest.fn().mockResolvedValue({}) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
      electionCase: { findUnique: jest.fn().mockResolvedValue({ id: 'case-1', status }) },
      organizationMembership: { findMany: jest.fn().mockResolvedValue([]) },
      caseAssignment: { findFirst: jest.fn() },
      $transaction: jest.fn(async callback => callback(tx as never)),
    };
    return { controller: new CasesController(db as unknown as PrismaService), db, tx };
  }

  it('records triage transition to verification for analysts', async () => {
    const { controller, tx } = makeController('OPEN');
    await controller.status('case-1', { status: 'UNDER_VERIFICATION' }, analyst);
    expect(tx.caseStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fromStatus: 'OPEN', toStatus: 'UNDER_VERIFICATION' }),
    }));
  });

  it('requires a supervisor review reason before closure', async () => {
    const { controller } = makeController('RESOLVED_PENDING_REVIEW');
    await expect(controller.status('case-1', { status: 'CLOSED', reason: 'Done' }, supervisor))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects closing a case before it is pending review', async () => {
    const { controller } = makeController('IN_PROGRESS');
    await expect(controller.status('case-1', { status: 'CLOSED', reason: 'Supervisor approved closure' }, supervisor))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('records the Phase 2.3 four-factor risk assessment', async () => {
    const { controller, tx } = makeController('OPEN');
    const result = await controller.assessRisk('case-1', {
      severity: 5,
      credibility: 5,
      urgency: 5,
      impact: 5,
      rationale: 'Multiple sources confirm urgent and high impact risk.',
    }, analyst);
    expect(result.score).toBe(9.96);
    expect(result.riskLevel).toBe('CRITICAL');
    expect(tx.electionCase.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ riskScore: 9.96, riskLevel: 'CRITICAL' }),
    }));
  });

  it('preserves legacy likelihood risk-score weighting', async () => {
    const { controller } = makeController('OPEN');
    const result = await controller.assessRisk('case-1', {
      severity: 5,
      likelihood: 1,
      impact: 1,
      rationale: 'Legacy factor values supplied by an existing API client.',
    }, analyst);
    expect(result.score).toBe(3.98);
    expect(result.method).toContain('compatibility mode');
  });
});
