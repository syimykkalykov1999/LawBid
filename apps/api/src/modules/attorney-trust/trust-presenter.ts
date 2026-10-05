import { stateBarLookupUrl } from '../verification/state-bar-links';
import type {
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

export function toPublicTrust(
  snap: TrustSnapshot,
  links: RegistryLinkDto[],
): PublicTrustDto {
  return {
    attorneyId: snap.attorneyId,
    level: snap.level,
    badge: snap.badge,
    signals: snap.signals,
    acceptsPayments: snap.gates.payments.ok,
    canBid: snap.gates.bids.ok,
    registryLinks: links,
  };
}

/** What the attorney does to climb: in the order it makes sense. */
export function nextSteps(snap: TrustSnapshot): string[] {
  const steps: string[] = [];
  const s = snap.signals;
  if (snap.holds.payments || snap.holds.bids) steps.push('hold_review');
  if (!s.licenseConfirmed) steps.push('registry_check');
  if (!s.stripeKyc) steps.push('stripe_kyc');
  else if (!s.stripeIdentity) {
    steps.push(
      snap.firmLink.status === FIRM_LINK.pending ||
        (snap.stripe.businessType && snap.stripe.businessType !== 'individual')
        ? 'firm_link'
        : s.nameCheck === NAME_CHECK.mismatch
          ? 'fix_name'
          : 'stripe_kyc',
    );
  }
  if (!s.documentsVerified) steps.push('documents');
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
    badgeLevel: snap.gates.badgeLevel,
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
