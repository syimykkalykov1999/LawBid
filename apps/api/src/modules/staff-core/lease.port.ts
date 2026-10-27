/**
 * Staff package T1: the lease engine as other modules see it (T2 offboard
 * returns a person's items; T4 queues take items). T3 implements it in
 * modules/work-lease (LeaseService) and binds LEASE_PORT there; until then
 * the no-op below answers (nothing is ever leased while
 * `staff.lease_enabled` is off).
 */
export const LEASE_PORT = Symbol('LEASE_PORT');

export interface LeasePort {
  /** Frees every item [adminId] holds (offboard, pause). Returns how many. */
  releaseAllFor(adminId: string, reason: string): Promise<number>;
}

export class NoopLeasePort implements LeasePort {
  releaseAllFor(): Promise<number> {
    return Promise.resolve(0);
  }
}
