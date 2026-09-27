import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './soft-delete.extension';

/**
 * The application's database client. Every query made through it (and
 * through `$transaction` clients it hands out) goes through the
 * soft-delete extension (docs/02_DATABASE.md §1.4, see
 * soft-delete.extension.ts): reads of models with `deleted_at` exclude
 * soft-deleted rows unless the caller opts out with `withDeleted()` /
 * `onlyDeleted()` or filters on `deleted_at` itself.
 *
 * The constructor returns the extended client (a proxy over this very
 * instance), so `PrismaService` keeps the plain `PrismaClient` type and
 * every existing injection site, `withTxRetry(prisma, ...)` and
 * `prisma.$transaction` call keep compiling and behaving as before. A query
 * extension changes no types, only the args that reach the engine.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // WARNING: do not add instance fields to this class. The constructor
    // returns the $extends proxy below, so per-instance state set here is
    // lost for every consumer; only prototype methods survive.
    // Returning an object from a derived-class constructor makes it the
    // `new` result; Nest registers that proxy as the provider instance.
    return this.$extends(softDeleteExtension()) as unknown as PrismaService;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
