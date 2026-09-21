import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * With an empty prisma/schema.prisma (no models yet — stage 1.3 adds the
 * auth models per docs/01_FOUNDATION_AUTH.md §15), the generated
 * PrismaClient's method typings degrade to `any` for $connect/$disconnect.
 * The eslint-disable lines below are scoped to exactly that and should be
 * revisited (likely removable) once real models exist.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
