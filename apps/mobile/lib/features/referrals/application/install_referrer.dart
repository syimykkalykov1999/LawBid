import 'dart:async';
import 'dart:io';

import 'package:android_play_install_referrer/android_play_install_referrer.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/partners/application/partners_providers.dart';
import 'package:lawbid/features/referrals/application/referrals_providers.dart';
import 'package:lawbid/features/referrals/presentation/referral_ask_code_sheet.dart';

const _kPendingCodeKey = 'referral.pending_code';
const _kReferrerCheckedKey = 'referral.install_referrer_checked';
const _kAskPendingKey = 'referral.ask_code_pending';
const _kAskDoneKey = 'referral.ask_code_done';

/// `lawbid_ref=<CODE>` inside the Play install referrer string
/// (the website's Play link URL-encodes it as
/// `referrer=lawbid_ref%3D<CODE>`, Play hands it back decoded).
final _refPattern = RegExp('lawbid_ref(?:=|%3D|:)([A-Za-z0-9]{4,24})');

/// Owner 2026-10-05 — what the referral flow keeps
/// between launches, in SharedPreferences (none of it is secret):
/// - the pending invite code read from the Play install referrer, applied
///   once after onboarding;
/// - that the referrer was already read (Play only answers reliably once);
/// - that this install signed up a NEW user, so the one-time «Есть код
///   приглашения?» sheet is owed (and, afterwards, that it was shown).
class PendingReferralStore {
  const PendingReferralStore(this._kv);

  final LocalKvStore _kv;

  String? get pendingCode => _kv.getString(_kPendingCodeKey);
  Future<void> setPendingCode(String code) =>
      _kv.setString(_kPendingCodeKey, code.toUpperCase());
  Future<void> clearPendingCode() => _kv.remove(_kPendingCodeKey);

  bool get referrerChecked => _kv.getString(_kReferrerCheckedKey) == '1';
  Future<void> markReferrerChecked() =>
      _kv.setString(_kReferrerCheckedKey, '1');

  bool get askPending => _kv.getString(_kAskPendingKey) == '1';
  Future<void> markAskPending() => _kv.setString(_kAskPendingKey, '1');

  bool get askDone => _kv.getString(_kAskDoneKey) == '1';
  Future<void> markAskDone() async {
    await _kv.setString(_kAskDoneKey, '1');
    await _kv.remove(_kAskPendingKey);
  }
}

final pendingReferralStoreProvider = Provider<PendingReferralStore>(
  (ref) => PendingReferralStore(ref.watch(localKvStoreProvider)),
);

/// Pulls `lawbid_ref=<CODE>` out of a raw install-referrer string.
String? parseReferralCodeFromReferrer(String? referrer) {
  if (referrer == null || referrer.isEmpty) return null;
  var decoded = referrer;
  try {
    decoded = Uri.decodeComponent(referrer);
  } catch (_) {}
  final m = _refPattern.firstMatch(decoded) ?? _refPattern.firstMatch(referrer);
  return m?.group(1)?.toUpperCase();
}

/// First launch on Android: reads the Play Install Referrer once and parks
/// a `lawbid_ref` code as the pending referral code. Never throws, never
/// blocks startup (called unawaited from `runLawBid`); a no-op on iOS and
/// on devices without Google Play.
Future<void> captureInstallReferrer(ProviderContainer container) async {
  try {
    if (!Platform.isAndroid) return;
    final store = container.read(pendingReferralStoreProvider);
    if (store.referrerChecked) return;
    await store.markReferrerChecked();
    final details = await AndroidPlayInstallReferrer.installReferrer
        .timeout(const Duration(seconds: 10));
    final code = parseReferralCodeFromReferrer(details.installReferrer);
    if (code != null && store.pendingCode == null) {
      await store.setPendingCode(code);
    }
  } catch (_) {
    // No Play services / plugin error / timeout — the user can still enter
    // a code by hand on the referral screen.
  }
}

/// Runs once per app launch when the signed-in, fully onboarded shell
/// appears (MainShell) — the "after onboarding" moment of §6:
/// 1. a pending code from the install referrer → `POST /referrals/apply`
///    once, toast «Код приглашения применён»; any failure (window passed,
///    invalid, already applied) drops the code silently;
/// 2. otherwise, for an install that just signed up a NEW user and never
///    saw it: the one-time «Есть код приглашения?» sheet — only when
///    `GET /referrals/me` or `GET /partners/me` says the program is on.
/// Skipped entirely inside a demo session.
class ReferralOnboardingHook {
  ReferralOnboardingHook(this._ref);

  final Ref _ref;
  bool _ran = false;

  Future<void> run(BuildContext context) async {
    if (_ran) return;
    _ran = true;
    try {
      final session = _ref.read(sessionControllerProvider);
      if (session == null || session.isDemo) return;
      final store = _ref.read(pendingReferralStoreProvider);

      final code = store.pendingCode;
      if (code != null) {
        await store.clearPendingCode();
        try {
          await _ref.read(referralsRepositoryProvider).apply(code);
          _ref.invalidate(referralMeProvider);
          if (context.mounted) {
            showAppSnackBar(
              context,
              _ref.read(translatorProvider).t('referral.autoApplied'),
            );
          }
        } catch (_) {
          // Outside the window / unknown code: stay silent, code dropped.
        }
        // A referrer code answers the question; no sheet.
        await store.markAskDone();
        return;
      }

      if (!store.askPending || store.askDone) return;
      var enabled = false;
      try {
        final me = await _ref.read(referralMeProvider.future);
        enabled = me.enabled && me.canApply;
      } catch (_) {}
      if (!enabled) {
        try {
          enabled = (await _ref.read(partnerMeProvider.future)).enabled;
        } catch (_) {}
      }
      await store.markAskDone();
      if (!enabled || !context.mounted) return;
      await ReferralAskCodeSheet.show(context);
    } catch (_) {
      // Never let a referral nicety break the main shell.
    }
  }
}

final referralOnboardingHookProvider = Provider<ReferralOnboardingHook>(
  ReferralOnboardingHook.new,
);
