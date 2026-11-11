import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns an API health response', () => {
    const result = new HealthController().health();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('uvoice-api');
    expect(result.timestamp).toBeTruthy();
  });
});
