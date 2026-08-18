jest.mock('./health.service', () => ({
  HealthService: class HealthService {},
}));

import { HealthController } from './health.controller';
import type { HealthService } from './health.service';

describe('HealthController', () => {
  const healthResponse = {
    status: 'ok',
    service: 'Neo Tourism ERP API',
    database: 'connected',
  };
  const healthService = {
    getHealth: jest.fn().mockResolvedValue(healthResponse),
  } as unknown as HealthService;
  const controller = new HealthController(healthService);

  it('returns the API and database health status', async () => {
    await expect(controller.getHealth()).resolves.toEqual(healthResponse);
  });
});
