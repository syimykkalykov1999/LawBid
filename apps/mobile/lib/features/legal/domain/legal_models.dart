import 'package:flutter/foundation.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Owner 2026-10-05 (legal) — texts the owner edits in the admin panel
/// (`GET /legal/settings`, already in the user's language): the case form
/// disclaimer, the unverified-attorney warning, the support note and the
/// partner disclosure / rules.
@immutable
class LegalTexts {
  const LegalTexts({
    required this.caseCreate,
    required this.attorneyUnverified,
    required this.supportNote,
    required this.partnerDisclosure,
    required this.partnerTerms,
  });

  /// The compiled-in defaults, used while the request is in flight or when
  /// it fails — same wording as the server defaults.
  LegalTexts.fallback(Translator t)
      : caseCreate = t.t('legal.fallback.caseCreate'),
        attorneyUnverified = t.t('legal.fallback.attorneyUnverified'),
        supportNote = t.t('legal.fallback.supportNote'),
        partnerDisclosure = t.t('legal.fallback.partnerDisclosure'),
        partnerTerms = '';

  final String caseCreate;
  final String attorneyUnverified;
  final String supportNote;
  final String partnerDisclosure;

  /// Plain text, numbered rules; empty in the fallback (the partner screen
  /// gets the rules from `/partners/me` anyway).
  final String partnerTerms;
}

/// The designated DMCA agent; all fields empty until the owner registers
/// one with the Copyright Office.
@immutable
class DmcaAgent {
  const DmcaAgent({
    required this.name,
    required this.email,
    required this.address,
  });

  const DmcaAgent.empty()
      : name = '',
        email = '',
        address = '';

  final String name;
  final String email;
  final String address;

  bool get isEmpty => name.trim().isEmpty && email.trim().isEmpty;
}

@immutable
class LegalSettings {
  const LegalSettings({
    required this.dmcaAgent,
    required this.texts,
    required this.partnerTermsVersion,
    this.fromServer = true,
  });

  /// What the app shows when `/legal/settings` cannot be read.
  LegalSettings.fallback(Translator t)
      : dmcaAgent = const DmcaAgent.empty(),
        texts = LegalTexts.fallback(t),
        partnerTermsVersion = '',
        fromServer = false;

  final DmcaAgent dmcaAgent;
  final LegalTexts texts;
  final String partnerTermsVersion;

  /// False for the compiled-in fallback.
  final bool fromServer;
}

/// Where the infringing material is on LawBid (`DmcaTargetType`).
enum DmcaTarget {
  post('post'),
  comment('comment'),
  caseComment('case_comment'),
  message('message');

  const DmcaTarget(this.wire);
  final String wire;

  static DmcaTarget? parse(String? v) =>
      DmcaTarget.values.where((k) => k.wire == v).firstOrNull;
}

/// The form the complainant fills in (17 U.S.C. §512(c)(3)).
@immutable
class DmcaNoticeDraft {
  const DmcaNoticeDraft({
    required this.complainantName,
    required this.complainantEmail,
    required this.complainantAddress,
    required this.complainantPhone,
    required this.workDescription,
    required this.goodFaith,
    required this.accuracySworn,
    required this.signature,
    this.target,
    this.targetId,
    this.infringingUrl,
  });

  final DmcaTarget? target;
  final String? targetId;
  final String? infringingUrl;
  final String complainantName;
  final String complainantEmail;
  final String complainantAddress;
  final String? complainantPhone;
  final String workDescription;
  final bool goodFaith;
  final bool accuracySworn;
  final String signature;
}
