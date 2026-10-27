/**
 * Staff package T1 (plan B3): before a head pulls, replaces, offboards or
 * sharply cuts the rights of a staff member, the caller (T2) asks this
 * port. T6 implements it (modules/staff-appeals) and binds RETALIATION_PORT:
 * if the person wrote an open complaint about the head within the window,
 * the action is NOT blocked, but a red mark goes to the owner and the person
 * goes to a reversible «ждёт решения владельца» hold. No second admin.
 */
export const RETALIATION_PORT = Symbol('RETALIATION_PORT');

export type RetaliationAction = 'pull' | 'replace' | 'offboard' | 'rights_cut';

export interface RetaliationCheck {
  /** A retaliation mark was written (the action still goes ahead). */
  flagged: boolean;
}

export interface RetaliationPort {
  check(
    subjectAdminId: string,
    actorAdminId: string,
    action: RetaliationAction,
    actionId?: string,
  ): Promise<RetaliationCheck>;
}

export class NoopRetaliationPort implements RetaliationPort {
  check(): Promise<RetaliationCheck> {
    return Promise.resolve({ flagged: false });
  }
}
