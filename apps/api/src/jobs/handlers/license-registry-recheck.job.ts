import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { StateRegistryService } from '../../modules/verification/services/state-registry.service';
import { VerificationAdminService } from '../../modules/verification/services/verification-admin.service';

const BATCH = 200;

export interface LicenseRegistryRecheckResult {
  checked: number;
  queued: number;
}

/**
 * Owner 2026-10-04: once a month every verified license in a state with an
 * enabled registry (Admin → Ключи и сервисы, owner 2026-10-05) is looked up again; a license whose
 * number disappeared or whose status is no longer active goes back to the
 * verifier queue (VerificationAdminService.registryRecheck). Lookups run
 * one at a time — the free registry is rate limited.
 */
@Injectable()
export class LicenseRegistryRecheckJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verification: VerificationAdminService,
    private readonly registries: StateRegistryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LicenseRegistryRecheckJob.name);
  }

  async run(now: Date = new Date()): Promise<LicenseRegistryRecheckResult> {
    const states = await this.registries.enabledStates();
    const result: LicenseRegistryRecheckResult = { checked: 0, queued: 0 };
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.attorneyLicense.findMany({
        where: { license_status: 'verified', state_code: { in: states } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });
      if (batch.length === 0) break;
      for (const { id } of batch) {
        try {
          const outcome = await this.verification.registryRecheck(id, now);
          if (outcome === null) continue;
          result.checked += 1;
          if (outcome === 'fail') result.queued += 1;
        } catch (err) {
          this.logger.warn({ err, licenseId: id }, 'registry re-check failed');
        }
      }
      cursor = batch[batch.length - 1].id;
    }
    this.logger.info({ ...result }, 'license registry re-check finished');
    return result;
  }
}
