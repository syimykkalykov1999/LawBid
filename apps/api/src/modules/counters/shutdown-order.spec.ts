import { Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Test } from '@nestjs/testing';

/** Class of error behind "counter flush failed" on every deploy: the DB
 * client disconnects in its own onModuleDestroy, so a consumer that flushes
 * in onApplicationShutdown finds it closed. Nest destroys the modules
 * farthest from the root first; a consumer's onModuleDestroy therefore still
 * sees an open DB. This pins that ordering for the flushers' hook. */
@Injectable()
class FakeDb implements OnModuleDestroy {
  open = true;
  onModuleDestroy(): void {
    this.open = false;
  }
}
@Module({ providers: [FakeDb], exports: [FakeDb] })
class DbModule {}

@Injectable()
class Flusher implements OnModuleDestroy {
  sawOpenDb: boolean | undefined;
  constructor(private readonly db: FakeDb) {}
  async onModuleDestroy(): Promise<void> {
    await Promise.resolve();
    this.sawOpenDb = this.db.open;
  }
}
@Module({ imports: [DbModule], providers: [Flusher], exports: [Flusher] })
class FeatureModule {}
@Module({ imports: [FeatureModule, DbModule] })
class RootModule {}

describe('shutdown order', () => {
  it('a consumer flushes in onModuleDestroy while the DB is still open', async () => {
    const mod = await Test.createTestingModule({
      imports: [RootModule],
    }).compile();
    const app = mod.createNestApplication();
    await app.init();
    const flusher = app.get(Flusher);
    await app.close();
    expect(flusher.sawOpenDb).toBe(true);
  });
});
