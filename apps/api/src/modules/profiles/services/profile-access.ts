import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { VerificationStatus } from '@prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ErrorCode } from '../../../common/errors/error-code.enum';

/**
 * Own-profile access policy (deny by default). The role is read from the
 * DB, not the access-token claim: a token minted before POST
 * /users/me/role still says `role: null`.
 *
 * - not an attorney → 403 FORBIDDEN (the caller's own role mismatch);
 * - attorney without an attorney_profiles row (onboarding not done) →
 *   404 NOT_FOUND.
 */
export async function requireOwnAttorney(
  prisma: PrismaService,
  userId: string,
): Promise<{ verificationStatus: VerificationStatus }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      attorney_profile: { select: { verification_status: true } },
    },
  });
  if (user?.role !== 'attorney') {
    throw new ForbiddenException({
      code: ErrorCode.FORBIDDEN,
      message: 'Available to attorneys only.',
    });
  }
  if (!user.attorney_profile) throw notFound();
  return { verificationStatus: user.attorney_profile.verification_status };
}

export function notFound(message = 'Not found.'): NotFoundException {
  return new NotFoundException({ code: ErrorCode.NOT_FOUND, message });
}

export function attorneyNotVerified(): HttpException {
  return new HttpException(
    {
      code: ErrorCode.ATTORNEY_NOT_VERIFIED,
      message: 'Available after verification.',
    },
    HttpStatus.FORBIDDEN,
  );
}

/** VALIDATION_ERROR with machine-readable details (plain HttpException:
 * the filter would replace a BadRequestException's details). */
export function validationError(
  message: string,
  details: Record<string, unknown>,
): HttpException {
  return new HttpException(
    { code: ErrorCode.VALIDATION_ERROR, message, details },
    HttpStatus.BAD_REQUEST,
  );
}
