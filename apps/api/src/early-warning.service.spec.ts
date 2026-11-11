import { detectIncidentPatterns, PatternReport } from './early-warning.service';

describe('detectIncidentPatterns', () => {
  const end = new Date('2026-11-11T12:00:00.000Z');
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const reports: PatternReport[] = [
    { id: '1', reference: 'R-1', stateCode: 'Jonglei', countyCode: 'Bor', category: 'VIOLENCE', submittedAt: new Date('2026-11-11T01:00:00.000Z') },
    { id: '2', reference: 'R-2', stateCode: 'Jonglei', countyCode: 'Bor', category: 'VIOLENCE', submittedAt: new Date('2026-11-11T02:00:00.000Z') },
    { id: '3', reference: 'R-3', stateCode: 'Jonglei', countyCode: 'Bor', category: 'VIOLENCE', submittedAt: new Date('2026-11-11T03:00:00.000Z') },
    { id: '4', reference: 'R-4', stateCode: 'Jonglei', countyCode: 'Bor', category: 'ACCESS', submittedAt: new Date('2026-11-11T04:00:00.000Z') },
    { id: '5', reference: 'R-5', stateCode: 'Jonglei', countyCode: 'Bor', category: 'ACCESS', submittedAt: new Date('2026-11-11T05:00:00.000Z') },
    { id: '6', reference: 'R-6', stateCode: 'Jonglei', countyCode: 'Bor', category: 'OTHER', submittedAt: new Date('2026-11-11T06:00:00.000Z') },
    { id: '7', reference: 'R-7', stateCode: 'Jonglei', countyCode: 'Bor', category: 'VIOLENCE', submittedAt: new Date('2026-11-09T01:00:00.000Z') },
    { id: '8', reference: 'R-8', stateCode: 'Jonglei', countyCode: null, category: 'VIOLENCE', submittedAt: new Date('2026-11-11T07:00:00.000Z') },
  ];

  it('detects repeated categories and county concentrations within the window', () => {
    const patterns = detectIncidentPatterns(reports, {
      windowStart: start,
      windowEnd: end,
      repeatedThreshold: 3,
      concentrationThreshold: 5,
    });
    expect(patterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleCode: 'REPEATED_LOCATION_CATEGORY', category: 'VIOLENCE', count: 3, severity: 'HIGH' }),
      expect.objectContaining({ ruleCode: 'GEOGRAPHIC_CONCENTRATION', category: null, count: 6, severity: 'HIGH' }),
    ]));
    expect(patterns).toHaveLength(2);
  });

  it('raises repeat severity at twice the configured threshold', () => {
    const repeatedReports = Array.from({ length: 6 }, (_, index) => ({
      id: String(index),
      reference: `R-${index}`,
      stateCode: 'Jonglei',
      countyCode: 'Bor',
      category: 'THREATS_INTIMIDATION',
      submittedAt: new Date(end.getTime() - index * 1000),
    }));
    expect(detectIncidentPatterns(repeatedReports, {
      windowStart: start,
      windowEnd: end,
      repeatedThreshold: 3,
      concentrationThreshold: 10,
    })[0]).toEqual(expect.objectContaining({ count: 6, severity: 'CRITICAL' }));
  });
});
