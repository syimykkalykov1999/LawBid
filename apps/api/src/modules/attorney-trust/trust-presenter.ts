import {
  stateBarLookupPrefilled,
  stateBarLookupUrl,
} from '../verification/state-bar-links';
import type {
  BarLookupDto,
  FirmLinkDto,
  OwnTrustDto,
  PublicTrustDto,
  RegistryLinkDto,
  TrustEventDto,
  TrustHoldsDto,
} from './attorney-trust.dto';
import type { TrustSnapshot } from './attorney-trust.service';
import { FIRM_LINK, NAME_CHECK } from './attorney-trust.constants';

export interface LicenseForLinks {
  state_code: string;
  bar_number: string;
  license_status: string;
  state: { name: string };
}

export function registryLinks(
  licenses: readonly LicenseForLinks[],
): RegistryLinkDto[] {
  const seen = new Set<string>();
  const out: RegistryLinkDto[] = [];
  for (const l of licenses) {
    if (l.license_status !== 'verified' || seen.has(l.state_code)) continue;
    seen.add(l.state_code);
    out.push({
      stateCode: l.state_code,
      stateName: l.state.name,
      url: stateBarLookupUrl(l.state_code, l.bar_number),
    });
  }
  return out;
}

/** Owner 2026-10-05 07:00: every license as the verifier works it — a
 * one-tap link to the state bar's page, or the search page plus the
 * number to paste, and whether the number is on the block list. */
export function barLookups(
  licenses: readonly LicenseForLinks[],
  blockedKeys: ReadonlySet<string>,
): BarLookupDto[] {
  return licenses.map((l) => ({
    stateCode: l.state_code,
    stateName: l.state.name,
    barNumber: l.bar_number,
    licenseStatus: l.license_status,
    url: stateBarLookupUrl(l.state_code, l.bar_number),
    prefilled: stateBarLookupPrefilled(l.state_code, l.bar_number),
    blocked: blockedKeys.has(blockKey(l.state_code, l.bar_number)),
  }));
}

/** `(state, normalised number)` — the key of `bar_number_blocks`. */
export function blockKey(stateCode: string, barNumber: string): string {
  return `${stateCode}:${barNumber.replace(/[^0-9a-z]/gi, '').toUpperCase()}`;
}

export function toPublicTrust(
  snap: TrustSnapshot,
  links: RegistryLinkDto[],
): PublicTrustDto {
  return {
    attorneyId: snap.attorneyId,
    level: snap.level,
    badge: snap.badge,
    cleared: snap.cleared,
    signals: snap.signals,
    acceptsPayments: snap.gates.payments.ok,
    canBid: snap.gates.bids.ok,
    registryLinks: links,
  };
}

/** What the attorney does next, in the order it makes sense: only what
 * the owner's switches ask for, plus a hold under review. */
export function nextSteps(snap: TrustSnapshot): string[] {
  const steps: string[] = [];
  const s = snap.signals;
  if (snap.holds.payments || snap.holds.bids) steps.push('hold_review');
  if (snap.cleared) return steps;
  if (snap.missing.includes('registry')) steps.push('registry_check');
  if (snap.missing.includes('identity')) {
    if (!s.stripeKyc) steps.push('stripe_kyc');
    else {
      steps.push(
        snap.firmLink.status === FIRM_LINK.pending ||
          (snap.stripe.businessType &&
            snap.stripe.businessType !== 'individual')
          ? 'firm_link'
          : s.nameCheck === NAME_CHECK.mismatch
            ? 'fix_name'
            : 'stripe_kyc',
      );
    }
  }
  if (snap.missing.includes('documents') || snap.documentsRequestedAt)
    steps.push('documents');
  return steps;
}

export function toFirmLink(snap: TrustSnapshot): FirmLinkDto {
  return {
    status: snap.firmLink.status,
    source: snap.firmLink.source,
    at: snap.firmLink.at?.toISOString() ?? null,
    emailDomain: snap.firmLink.emailDomain,
  };
}

export function toOwnTrust(
  snap: TrustSnapshot,
  links: RegistryLinkDto[],
): OwnTrustDto {
  return {
    ...toPublicTrust(snap, links),
    bidsGate: snap.gates.bids,
    paymentsGate: snap.gates.payments,
    requirements: snap.requirements,
    missing: snap.missing,
    staffStatus: snap.staffStatus,
    documentsRequested: snap.documentsRequestedTemplate,
    payoutDelayDays: snap.payoutDelayDays,
    nextSteps: nextSteps(snap),
    firmLink: toFirmLink(snap),
    stripeBusinessType: snap.stripe.businessType,
  };
}

export function toHolds(snap: TrustSnapshot): TrustHoldsDto {
  return {
    payments: snap.holds.payments,
    paymentsAt: snap.holds.paymentsAt?.toISOString() ?? null,
    bids: snap.holds.bids,
    bidsAt: snap.holds.bidsAt?.toISOString() ?? null,
    note: snap.holds.note,
  };
}

export function toEventDto(e: {
  id: string;
  kind: string;
  from_level: number | null;
  to_level: number | null;
  actor_type: string;
  actor_id: string | null;
  details: unknown;
  created_at: Date;
}): TrustEventDto {
  return {
    id: e.id,
    kind: e.kind,
    fromLevel: e.from_level,
    toLevel: e.to_level,
    actorType: e.actor_type,
    actorId: e.actor_id,
    details:
      e.details && typeof e.details === 'object' && !Array.isArray(e.details)
        ? (e.details as Record<string, unknown>)
        : {},
    createdAt: e.created_at.toISOString(),
  };
}
