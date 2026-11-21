import { validate } from 'class-validator';
import { LeadStatus } from '../../../generated/prisma/enums';
import {
  MANUAL_LEAD_STATUSES,
  UpdateLeadStatusDto,
} from './update-lead-status.dto';

describe('UpdateLeadStatusDto', () => {
  it.each(MANUAL_LEAD_STATUSES)(
    'accepts confirmed manual status %s',
    async (status) => {
      const dto = Object.assign(new UpdateLeadStatusDto(), { status });
      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it.each([
    LeadStatus.NEW,
    LeadStatus.SALE_MADE,
    LeadStatus.HANDLING,
    LeadStatus.QUOTING,
    LeadStatus.CALLBACK,
    LeadStatus.NO_RESPONSE,
  ])('rejects non-manual or legacy status %s', async (status) => {
    const dto = Object.assign(new UpdateLeadStatusDto(), { status });
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
