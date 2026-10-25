import { AsyncLocalStorage } from 'node:async_hooks';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Owner 2026-10-25: does the client that is being answered decode AVIF?
 * It says so with `X-Image-Formats: avif[,...]`. Without the header (the
 * app today, crawlers, old phones) image links stay WebP/JPEG, exactly as
 * before. FilesService reads it where it builds image links.
 */
class ImageFormatContext {
  private readonly als = new AsyncLocalStorage<{ avif: boolean }>();

  wantsAvif(): boolean {
    return this.als.getStore()?.avif === true;
  }

  run<T>(avif: boolean, fn: () => T): T {
    return this.als.run({ avif }, fn);
  }
}

export const imageFormatContext = new ImageFormatContext();

export function headerWantsAvif(value: unknown): boolean {
  const raw = Array.isArray(value) ? value.join(',') : value;
  if (typeof raw !== 'string') return false;
  return raw
    .toLowerCase()
    .split(',')
    .some((t) => t.trim() === 'avif');
}

@Injectable()
export class ImageFormatInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers?: Record<string, unknown> }>();
    if (!headerWantsAvif(req?.headers?.['x-image-formats'])) {
      return next.handle();
    }
    return new Observable((subscriber) =>
      imageFormatContext.run(true, () => next.handle().subscribe(subscriber)),
    );
  }
}
