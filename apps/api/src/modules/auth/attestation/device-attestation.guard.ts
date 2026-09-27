import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  ATTESTATION_HEADER,
  DeviceAttestationService,
} from './device-attestation.service';

/**
 * docs/01 §10.6 SMS-pumping / device-integrity defence, applied to the
 * two unauthenticated entry points that cost money or mint accounts:
 * POST /auth/otp/request and POST /auth/social. No-op while the
 * `device_attestation` flag is off; when on, a request without a
 * verifiable `X-Device-Attestation` (+ `X-Platform: ios|android`) gets
 * 403 DEVICE_ATTESTATION_REQUIRED before any provider call, rate-limit
 * budget or idempotency claim is spent (guards run before interceptors).
 */
@Injectable()
export class DeviceAttestationGuard implements CanActivate {
  constructor(private readonly attestation: DeviceAttestationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await this.attestation.isRequired())) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const verdict = await this.attestation.verify({
      platform: req.header('x-platform'),
      token: req.header(ATTESTATION_HEADER),
      deviceId: req.header('x-device-id')?.trim() || undefined,
      requestBinding: `${req.method} ${req.originalUrl.split('?')[0]}`,
    });
    if (verdict.valid) return true;

    throw new ForbiddenException({
      code: ErrorCode.DEVICE_ATTESTATION_REQUIRED,
      message: 'This request requires a verified device attestation.',
      details: { reason: verdict.reason },
    });
  }
}
