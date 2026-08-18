import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('returns the API health status', () => {
    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'Neo Tourism ERP API',
    });
  });
});
