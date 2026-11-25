import 'package:flutter/foundation.dart';

/// Owner row 87 (plan step 5, mockup v4 approved 18.11): the client side of
/// the call hotline — the request, its states and the numbers the app needs.

/// `GET /hotline/config` → `mode` (admin «Горячая линия»: who may wait).
enum HotlineMode { onForAll, bySubscription, offForAll }

HotlineMode hotlineModeOf(String? raw) => switch (raw) {
      'off_for_all' => HotlineMode.offForAll,
      'by_subscription' => HotlineMode.bySubscription,
      _ => HotlineMode.onForAll,
    };

/// The request's state on the server (`HotlineRequestStatus`).
enum HotlineStatus {
  /// «Ищем адвоката…» (an offer may be ringing an attorney right now).
  searching,

  /// Everybody is busy: in the queue with a rough place and wait.
  queued,

  /// «Сообщите, когда появится адвокат»: the app may be closed; the place
  /// is kept until [HotlineRequest.notifyUntil].
  offline,

  /// «Взять»: the 1:1 voice call runs ([HotlineRequest.callId]).
  connected,
  ended,
  cancelled;

  bool get waiting => this == searching || this == queued || this == offline;
  bool get over => this == ended || this == cancelled;

  static HotlineStatus of(String? raw) => switch (raw) {
        'queued' => queued,
        'offline' => offline,
        'connected' => connected,
        'ended' => ended,
        'cancelled' => cancelled,
        _ => searching,
      };
}

/// The one-time disclosure (ABA 7.3 / no recording / no relationship yet)
/// or, on later calls, the short line — null = show nothing.
@immutable
class HotlineDisclosure {
  const HotlineDisclosure({required this.full, required this.version});

  /// true = the full text with «Понятно»; false = «Звонки не записываются».
  final bool full;
  final int version;
}

@immutable
class HotlineConfig {
  const HotlineConfig({
    required this.enabled,
    this.mode = HotlineMode.onForAll,
    this.maxLanguages = 3,
    this.topicMaxChars = 80,
    this.countersIntervalSec = 5,
    this.notifyClaimSec = 60,
    this.reviewEnabled = true,
    this.disclosure,
  });

  static const off = HotlineConfig(enabled: false);

  final bool enabled;
  final HotlineMode mode;
  final int maxLanguages;
  final int topicMaxChars;
  final int countersIntervalSec;
  final int notifyClaimSec;
  final bool reviewEnabled;
  final HotlineDisclosure? disclosure;

  /// The client button shows (master flag aside).
  bool get open => enabled && mode != HotlineMode.offForAll;
}

/// The attorney who took the call.
@immutable
class HotlineLawyer {
  const HotlineLawyer({
    required this.id,
    required this.name,
    required this.state,
    this.username,
    this.avatarUrl,
    this.barNumber,
  });

  final String id;
  final String name;
  final String state;
  final String? username;
  final String? avatarUrl;
  final String? barNumber;
}

/// What the client asked: «О чём звонок», qualification, state, languages.
@immutable
class HotlineDraft {
  const HotlineDraft({
    required this.topic,
    required this.practice,
    required this.state,
    required this.languages,
  });

  factory HotlineDraft.fromJson(Map<String, Object?> j) => HotlineDraft(
        topic: '${j['topic'] ?? ''}',
        practice: '${j['practice'] ?? ''}',
        state: '${j['state'] ?? ''}',
        languages: [
          for (final l in (j['languages'] as List?) ?? const <Object?>[]) '$l',
        ],
      );

  final String topic;
  final String practice;
  final String state;
  final List<String> languages;

  bool get valid =>
      topic.trim().isNotEmpty &&
      practice.isNotEmpty &&
      state.isNotEmpty &&
      languages.isNotEmpty;

  HotlineDraft copyWith({List<String>? languages}) => HotlineDraft(
        topic: topic,
        practice: practice,
        state: state,
        languages: languages ?? this.languages,
      );

  Map<String, Object?> toJson() => {
        'topic': topic,
        'practice': practice,
        'state': state,
        'languages': languages,
      };
}

/// `GET /hotline/requests/:id` (and the `hotline:request` socket event).
@immutable
class HotlineRequest {
  const HotlineRequest({
    required this.id,
    required this.status,
    this.positionBand,
    this.waitBand,
    this.endReason,
    this.lawyer,
    this.notifyUntil,
    this.disclosure,
    this.callId,
    this.conversationId,
  });

  final String id;
  final HotlineStatus status;

  /// «1», «2-5», «6-20», «20+» — never exact.
  final String? positionBand;

  /// lt5 | 5to15 | 15to30 | gt30 (minutes).
  final String? waitBand;

  /// cancelled, lost, queue_full, notify_expired, notify_exhausted,
  /// time_limit, ended.
  final String? endReason;
  final HotlineLawyer? lawyer;
  final DateTime? notifyUntil;
  final HotlineDisclosure? disclosure;
  final String? callId;
  final String? conversationId;

  HotlineRequest _copy({
    HotlineLawyer? lawyer,
    bool dropDisclosure = false,
  }) =>
      HotlineRequest(
        id: id,
        status: status,
        positionBand: positionBand,
        waitBand: waitBand,
        endReason: endReason,
        lawyer: lawyer ?? this.lawyer,
        notifyUntil: notifyUntil,
        disclosure: dropDisclosure ? null : disclosure,
        callId: callId,
        conversationId: conversationId,
      );

  HotlineRequest withLawyer(HotlineLawyer lawyer) => _copy(lawyer: lawyer);

  /// «Понятно» read: the card goes at once (the server agrees next read).
  HotlineRequest withoutDisclosure() => _copy(dropDisclosure: true);
}

/// One row of «Сейчас на линии»: banded counts ('0', '1' = «есть», '10+'…).
@immutable
class HotlineCounter {
  const HotlineCounter({
    required this.key,
    required this.lawyers,
    required this.clients,
  });

  /// `l:<lang>` (a language) or `b:<state~practice~lang>`.
  final String key;
  final String lawyers;
  final String clients;
}

/// «Адвокат на линии. Позвонить сейчас?» — the push / socket notice.
@immutable
class HotlineNotice {
  const HotlineNotice({
    required this.requestId,
    this.token,
    this.expiresAt,
  });

  final String requestId;
  final String? token;
  final DateTime? expiresAt;

  bool expired(DateTime now) => expiresAt != null && now.isAfter(expiresAt!);
}

/// The short optional review after the call (mockup c12).
@immutable
class HotlineReviewPrompt {
  const HotlineReviewPrompt({
    required this.requestId,
    this.lawyer,
    this.conversationId,
  });

  final String requestId;
  final HotlineLawyer? lawyer;
  final String? conversationId;
}
