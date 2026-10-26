import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { InfraRequestError } from './infra-change.service';

/** InfraRequestError → the API error envelope (code + plain message). */
export function infraHttp(e: unknown): never {
  if (!(e instanceof InfraRequestError)) throw e;
  const map: Record<InfraRequestError['code'], [HttpStatus, ErrorCode]> = {
    not_found: [HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND],
    unknown_item: [HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR],
    bad_state: [HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR],
    same_state: [HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR],
    no_price: [HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR],
    daily_cap: [HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED],
    busy: [HttpStatus.CONFLICT, ErrorCode.FEATURE_DISABLED],
    wrong_status: [HttpStatus.CONFLICT, ErrorCode.FEATURE_DISABLED],
    quiet_hours: [HttpStatus.CONFLICT, ErrorCode.FEATURE_DISABLED],
    not_configured: [HttpStatus.CONFLICT, ErrorCode.FEATURE_DISABLED],
    bad_plan: [HttpStatus.CONFLICT, ErrorCode.FEATURE_DISABLED],
  };
  const [status, code] = map[e.code];
  throw new HttpException({ code, message: e.message }, status);
}
