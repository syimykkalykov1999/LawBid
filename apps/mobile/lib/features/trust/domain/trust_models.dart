import 'package:flutter/foundation.dart';

/// Owner 2026-10-05 — attorney trust levels (docs/ATTORNEY_TRUST.md). The
/// sign-up stays simple (state + bar number under a sworn statement); what
/// LawBid *shows* and what the attorney may *do* follow a level that only
/// grows with checks LawBid did not have to take the attorney's word for.
abstract final class TrustLevels {
  static const min = 0;
  static const max = 3;

  /// `trust.level.<n>` — the chip label («Заявлен», «Реестр», «Личность»,
  /// «Документы»).
  static String nameKey(int level) => 'trust.level.${clamp(level)}';

  /// `trust.level.<n>.desc` — one sentence on what the level means.
  static String descriptionKey(int level) => 'trust.level.${clamp(level)}.desc';

  static int clamp(int level) => level.clamp(min, max);
}

/// `OwnTrustDto.nextSteps` entries, mapped to `trust.next.<step>` texts.
enum TrustNextStep {
  holdReview('hold_review'),
  registryCheck('registry_check'),
  stripeKyc('stripe_kyc'),
  firmLink('firm_link'),
  fixName('fix_name'),
  documents('documents'),
  unknown('');

  const TrustNextStep(this.wire);
  final String wire;

  static TrustNextStep parse(String? v) => TrustNextStep.values.firstWhere(
        (s) => s.wire == v,
        orElse: () => TrustNextStep.unknown,
      );

  /// Translation key of the human text for this step.
  String get textKey => switch (this) {
        TrustNextStep.unknown => 'trust.next.unknown',
        _ => 'trust.next.$wire',
      };
}

/// Text key for a raw `nextSteps` entry (a newer server may send a step
/// this build does not know — it still gets a sentence).
String trustNextStepTextKey(String step) => TrustNextStep.parse(step).textKey;

/// A requirement the owner can switch on (admin → trust settings): the
/// badge and payments open once every enabled one is met or staff cleared
/// the attorney.
enum TrustRequirement {
  registry('registry'),
  identity('identity'),
  documents('documents');

  const TrustRequirement(this.wire);
  final String wire;

  static TrustRequirement? parse(String? v) {
    for (final r in values) {
      if (r.wire == v) return r;
    }
    return null;
  }

  /// `trust.req.<name>` — the row label («Реестр штата» / «Личность
  /// (Stripe)» / «Документы»).
  String get labelKey => 'trust.req.$wire';
}

/// Where the attorney stands with staff (`OwnTrustDto.staffStatus`).
enum TrustStaffStatus { selfDeclared, needsStaff, cleared, suspended }

/// What staff asked for (`OwnTrustDto.documentsRequested`).
enum DocumentRequestTemplate { idSelfie, barCard, firmLetter, custom }

/// `trust.docs.<template>` — the template sentence of a document request
/// (notification + the own screen's card); `custom` shows the staff note.
String documentRequestTextKey(String? template) => switch (template) {
      'id_selfie' => 'trust.docs.id_selfie',
      'bar_card' => 'trust.docs.bar_card',
      'firm_letter' => 'trust.docs.firm_letter',
      'custom' => 'trust.docs.custom',
      _ => 'trust.docs.generic',
    };

enum LicenseConfirmedBy { registry, staff }

enum NameCheck { match, mismatch, unknown }

/// What exactly was checked (`TrustSignalsDto`).
@immutable
class TrustSignals {
  const TrustSignals({
    required this.selfAttested,
    required this.licenseConfirmed,
    required this.licenseConfirmedBy,
    required this.documentsVerified,
    required this.stripeKyc,
    required this.stripeIdentity,
    required this.identityConfirmed,
    required this.nameCheck,
    required this.firmLinkConfirmed,
  });

  final bool selfAttested;
  final bool licenseConfirmed;
  final LicenseConfirmedBy? licenseConfirmedBy;
  final bool documentsVerified;
  final bool stripeKyc;

  /// Stripe KYC finished AND its legal name matches the profile/registry.
  final bool stripeIdentity;

  /// Documents verified or Stripe identity (or a confirmed firm link).
  final bool identityConfirmed;
  final NameCheck nameCheck;
  final bool firmLinkConfirmed;
}

/// Where a client can check the bar number themselves.
@immutable
class RegistryLink {
  const RegistryLink({
    required this.stateCode,
    required this.stateName,
    required this.url,
  });

  final String stateCode;
  final String stateName;
  final String? url;
}

/// `GET /trust/attorneys/:id` — what a client sees.
@immutable
class PublicTrust {
  const PublicTrust({
    required this.attorneyId,
    required this.level,
    required this.badge,
    required this.cleared,
    required this.signals,
    required this.acceptsPayments,
    required this.canBid,
    required this.registryLinks,
  });

  final String attorneyId;
  final int level;
  final bool badge;

  /// Every enabled requirement is met (or staff confirmed): the badge and
  /// payments are open.
  final bool cleared;
  final TrustSignals signals;
  final bool acceptsPayments;
  final bool canBid;
  final List<RegistryLink> registryLinks;
}

enum TrustGateReason { requirements, hold, suspended }

/// One gate (bids / payments): open, or why not.
@immutable
class TrustGate {
  const TrustGate({
    required this.ok,
    required this.reason,
    required this.missing,
    required this.currentLevel,
    required this.hold,
  });

  final bool ok;
  final TrustGateReason? reason;

  /// Enabled requirements the attorney has not met yet.
  final List<TrustRequirement> missing;
  final int currentLevel;

  /// Hold code when paused: complaint · name_mismatch · duplicate_claim ·
  /// admin.
  final String? hold;
}

enum FirmLinkStatus { none, pending, confirmed }

enum FirmLinkSource { registry, email, staff }

@immutable
class FirmLink {
  const FirmLink({
    required this.status,
    required this.source,
    required this.at,
    required this.emailDomain,
  });

  final FirmLinkStatus status;
  final FirmLinkSource? source;
  final DateTime? at;
  final String? emailDomain;
}

/// `GET /trust/me` — the attorney's own view: the public part plus gates,
/// payout delay and what to do next.
@immutable
class OwnTrust {
  const OwnTrust({
    required this.public,
    required this.bidsGate,
    required this.paymentsGate,
    required this.requirements,
    required this.missing,
    required this.staffStatus,
    required this.documentsRequested,
    required this.payoutDelayDays,
    required this.nextSteps,
    required this.firmLink,
    required this.stripeBusinessType,
  });

  final PublicTrust public;
  final TrustGate bidsGate;
  final TrustGate paymentsGate;

  /// Requirements the owner switched on.
  final Set<TrustRequirement> requirements;

  /// Enabled requirements still missing for the badge and payments.
  final List<TrustRequirement> missing;
  final TrustStaffStatus staffStatus;

  /// Raw template (`id_selfie` · `bar_card` · `firm_letter` · `custom`)
  /// when staff asked for documents; null otherwise.
  final String? documentsRequested;
  final int? payoutDelayDays;

  /// Raw server steps, in the order the server wants them shown.
  final List<String> nextSteps;
  final FirmLink firmLink;
  final String? stripeBusinessType;

  int get level => public.level;
  bool get cleared => public.cleared;

  /// A hold or suspension on either gate.
  bool get onHold =>
      (!bidsGate.ok && bidsGate.reason != TrustGateReason.requirements) ||
      (!paymentsGate.ok && paymentsGate.reason != TrustGateReason.requirements);

  /// A requirement is met when it is enabled and not missing.
  bool met(TrustRequirement r) =>
      requirements.contains(r) && !missing.contains(r);

  /// The firm e-mail form is shown while the link is pending or the server
  /// names it as the next step.
  bool get needsFirmEmail =>
      firmLink.status == FirmLinkStatus.pending ||
      nextSteps.contains(TrustNextStep.firmLink.wire);
}
