import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:lawbid/core/diagnostics/app_event_names.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/time/local_now.dart';

/// Owner 2026-10-22 (checklist §27): the store's own «Rate LawBid» dialog
/// (`in_app_review`: StoreKit `SKStoreReviewController` / Play In-App
/// Review) after a meaningful positive moment — a 5-star review of an
/// attorney, a case the client confirmed as done, a confirmed consultation.
///
/// Rules, like the big apps: never more than once in [minInterval] on a
/// device, never on the web, and only behind the feature flag
/// [flag] (off by default — the owner switches it on in the admin panel
/// once the store listings exist). Both stores decide themselves whether
/// the dialog really appears (Apple: at most three times a year; Google:
/// its own quota), so a request is best effort and never throws.
class ReviewPrompter {
  ReviewPrompter({
    required LocalKvStore store,
    required DateTime Function() now,
    required bool Function() enabled,
    InAppReview? review,
  })  : _store = store,
        _now = now,
        _enabled = enabled,
        _review = review ?? InAppReview.instance;

  static const flag = 'in_app_review';
  static const minInterval = Duration(days: 90);

  /// ISO-8601 time of the last request on this device.
  static const lastAskedKey = 'review.lastAsked.v1';

  final LocalKvStore _store;
  final DateTime Function() _now;
  final bool Function() _enabled;
  final InAppReview _review;

  /// When the last request was made on this device, or null.
  DateTime? get lastAsked {
    final raw = _store.getString(lastAskedKey);
    return raw == null ? null : DateTime.tryParse(raw);
  }

  /// Whether a request would be made right now (flag on, not web, 90 days
  /// since the last one).
  bool get due {
    if (kIsWeb || !_enabled()) return false;
    final last = lastAsked;
    return last == null || _now().difference(last) >= minInterval;
  }

  /// Asks the store for its review dialog after a positive moment. Returns
  /// true when a request went out (the dialog itself is the store's call).
  Future<bool> maybeAsk() async {
    if (!due) return false;
    try {
      if (!await _review.isAvailable()) return false;
      // The date is written first: a crash inside the store dialog must not
      // turn into a second request a moment later.
      await _store.setString(lastAskedKey, _now().toIso8601String());
      await _review.requestReview();
      AppEvents.track(AppEventNames.reviewPrompted);
      return true;
    } catch (e) {
      if (kDebugMode) debugPrint('in-app review: $e');
      return false;
    }
  }
}

final reviewPrompterProvider = Provider<ReviewPrompter>(
  (ref) => ReviewPrompter(
    store: ref.watch(localKvStoreProvider),
    now: ref.watch(appClockProvider),
    enabled: () =>
        ref.read(featureFlagsControllerProvider).isEnabled(ReviewPrompter.flag),
  ),
);

/// Fire-and-forget form for call sites inside async UI handlers.
void askForReviewLater(Ref ref) =>
    unawaited(ref.read(reviewPrompterProvider).maybeAsk());
