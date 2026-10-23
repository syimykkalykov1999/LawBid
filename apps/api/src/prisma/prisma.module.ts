import { Global, Module } from '@nestjs/common';
import { PrismaReadService } from './prisma-read.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PrismaReadService],
  exports: [PrismaService, PrismaReadService],
})
export class PrismaModule {}
