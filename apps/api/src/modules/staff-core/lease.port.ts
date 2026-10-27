/**
 * Staff package: the lease engine as other modules see it (T2 offboard
 * returns a person's items; T4 queues take, close and reopen items). T3
 * implements it in modules/work-lease (LeaseService) and binds LEASE_PORT
 * there; the no-op below answers while nothing is bound or a switch is off
 * (nothing is ever leased while `staff.lease_enabled` is off).
 */
export const LEASE_PORT = Symbol('LEASE_PORT');

/** Who asks for work: the admin and the countries their lists are limited to. */
export interface LeaseActorRef {
  adminId: string;
  /** null / absent = every country. */
  countries?: string[] | null;
}

/** What «Следующий» answered. Only `leased` carries a new item. */
export interface LeaseNextResult {
  status: 'leased' | 'busy' | 'empty' | 'wrap_up' | 'away' | 'offline' | 'off';
  /** The newly leased item (status `leased`). */
  itemId?: string;
  /** Items already in this person's hands (status `busy`). */
  heldItemIds?: string[];
  /** Seconds until the next item may be asked for (status `wrap_up`). */
  retryAfterSec?: number;
}

export interface LeasePort {
  /** Frees every item [adminId] holds (offboard, pause). Returns how many. */
  releaseAllFor(adminId: string, reason: string): Promise<number>;
  /** True when leases serve [kind] (the master and the queue's own switch are on). */
  servesQueue(kind: string): Promise<boolean>;
  /** «Следующий»: leases the oldest free item of [kind] to this person. */
  nextFor(kind: string, actor: LeaseActorRef): Promise<LeaseNextResult>;
  /** The holder closed the item (keeps them out of a later «не решено»). */
  done(kind: string, itemId: string, adminId: string): Promise<void>;
  /** «Не решено»: back to the queue, first in line, never to the previous worker. */
  reopen(kind: string, itemId: string): Promise<void>;
}

export class NoopLeasePort implements LeasePort {
  releaseAllFor(): Promise<number> {
    return Promise.resolve(0);
  }
  servesQueue(): Promise<boolean> {
    return Promise.resolve(false);
  }
  nextFor(): Promise<LeaseNextResult> {
    return Promise.resolve({ status: 'off' });
  }
  done(): Promise<void> {
    return Promise.resolve();
  }
  reopen(): Promise<void> {
    return Promise.resolve();
  }
}
