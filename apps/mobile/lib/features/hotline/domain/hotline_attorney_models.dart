import 'package:flutter/foundation.dart';

/// Owner row 87 (hotline plan steps 6–7, mockup 18.11): what the attorney's
/// hotline screens read. The live parts come over the existing `/realtime`
/// socket as plain maps (`hotline:*` events), so they are parsed here; the
/// REST answers come through the generated client (data/).

/// `hotline.mode` — «Вкл для всех» / «По подписке» / «Выкл для всех».
enum HotlineLineMode {
  onForAll,
  bySubscription,
  offForAll;

  static HotlineLineMode parse(Object? raw) => switch (raw) {
        'by_subscription' => bySubscription,
        'off_for_all' => offForAll,
        _ => onForAll,
      };
}

/// May this attorney wait for calls, and through what (mockup a2, the
/// «Горячая линия — в вашей подписке» row).
@immutable
class HotlineAccess {
  const HotlineAccess({
    required this.allowed,
    this.via,
    this.reason,
  });

  final bool allowed;

  /// free · plan · addon · trial (null when not allowed).
  final String? via;

  /// off_for_all · not_in_plan · addon_required (when not allowed).
  final String? reason;
}

/// The one-time text under the first offer (key + its ru / en wording).
@immutable
class HotlineAttorneyDisclosure {
  const HotlineAttorneyDisclosure({
    required this.version,
    this.key,
    this.ru,
    this.en,
  });

  final int version;

  /// Null: already seen («Понятно» was tapped).
  final String? key;
  final String? ru;
  final String? en;
}

@immutable
class HotlineAttorneyConfig {
  const HotlineAttorneyConfig({
    required this.enabled,
    required this.mode,
    required this.heartbeatSec,
    required this.offerTimeoutSec,
    required this.countersIntervalSec,
    this.attorneyMaxLanguages = 50,
    this.access,
    this.disclosure,
  });

  final bool enabled;
  final HotlineLineMode mode;
  final int heartbeatSec;
  final int offerTimeoutSec;
  final int countersIntervalSec;

  /// `hotline.attorney_max_languages` (owner 25.11): how many languages his
  /// line may have; 0 = no limit.
  final int attorneyMaxLanguages;

  /// Attorneys only.
  final HotlineAccess? access;
  final HotlineAttorneyDisclosure? disclosure;
}

/// `HotlineLineViewDto`: the attorney's line now.
@immutable
class HotlineLine {
  const HotlineLine({
    required this.online,
    required this.state,
    required this.accepting,
    required this.states,
    required this.practiceAreas,
    required this.languages,
    required this.heartbeatSec,
  });

  final bool online;

  /// idle · offered · busy · not_accepting · paused · off.
  final String state;
  final bool accepting;
  final List<String> states;
  final List<String> practiceAreas;
  final List<String> languages;
  final int heartbeatSec;
}

List<String> _strings(Object? raw) =>
    raw is List ? [for (final x in raw) '$x'] : const [];

String _s(Object? raw) => raw is String ? raw : (raw == null ? '' : '$raw');

String? _orNull(Object? raw) => raw is String && raw.isNotEmpty ? raw : null;

int _int(Object? raw) => raw is num ? raw.toInt() : int.tryParse('$raw') ?? 0;

/// `hotline:offer` — a client of the line for this attorney (mockup a4):
/// the topic, practice, state and the call's LANGUAGE are seen at once.
@immutable
class HotlineOffer {
  const HotlineOffer({
    required this.requestId,
    required this.topic,
    required this.state,
    required this.practiceArea,
    required this.language,
    required this.languages,
    required this.clientName,
    required this.expiresAt,
    this.clientUsername,
    this.clientAvatarUrl,
    this.waitingMore,
  });

  static HotlineOffer? fromEvent(Object? data) {
    if (data is! Map) return null;
    final id = _s(data['requestId']);
    if (id.isEmpty) return null;
    final langs = _strings(data['languages']);
    final lang = _s(data['language']);
    return HotlineOffer(
      requestId: id,
      topic: _s(data['topic']),
      state: _s(data['state']),
      practiceArea: _s(data['practiceArea']),
      language: lang.isNotEmpty ? lang : (langs.isEmpty ? '' : langs.first),
      languages: langs,
      clientName: _s(data['clientName']),
      clientUsername: _orNull(data['clientUsername']),
      clientAvatarUrl: _orNull(data['clientAvatarUrl']),
      waitingMore: _orNull(data['waitingMore']),
      expiresAt: DateTime.fromMillisecondsSinceEpoch(_int(data['expiresAt'])),
    );
  }

  final String requestId;
  final String topic;
  final String state;
  final String practiceArea;

  /// The call's language: the client's language that matched his line.
  final String language;
  final List<String> languages;
  final String clientName;
  final String? clientUsername;
  final String? clientAvatarUrl;

  /// «Ещё звонят: N» (banded by the server).
  final String? waitingMore;
  final DateTime expiresAt;
}

/// «Клиент ждёт · язык» (mockup a7): the client who waits longest in the
/// attorney's queues while he talks (heartbeat answer `waiting`).
@immutable
class HotlineWaiting {
  const HotlineWaiting({
    required this.requestId,
    required this.topic,
    required this.state,
    required this.practiceArea,
    required this.language,
    required this.waitingSince,
  });

  static HotlineWaiting? fromJson(Object? data) {
    if (data is! Map) return null;
    final id = _s(data['requestId']);
    if (id.isEmpty) return null;
    return HotlineWaiting(
      requestId: id,
      topic: _s(data['topic']),
      state: _s(data['state']),
      practiceArea: _s(data['practiceArea']),
      language: _s(data['language']),
      waitingSince:
          DateTime.fromMillisecondsSinceEpoch(_int(data['waitingSince'])),
    );
  }

  final String requestId;
  final String topic;
  final String state;
  final String practiceArea;
  final String language;
  final DateTime waitingSince;

  @override
  bool operator ==(Object other) =>
      other is HotlineWaiting && other.requestId == requestId;

  @override
  int get hashCode => requestId.hashCode;
}

/// The running hotline call as the call screen shows it (mockup a4–a6):
/// set on the offer, given its call id by «Ответить» / `hotline:connected`.
@immutable
class HotlineCallInfo {
  const HotlineCallInfo({
    required this.requestId,
    required this.topic,
    required this.state,
    required this.practiceArea,
    required this.language,
    required this.clientName,
    this.callId,
    this.clientId,
    this.clientUsername,
    this.clientAvatarUrl,
  });

  factory HotlineCallInfo.ofOffer(HotlineOffer o) => HotlineCallInfo(
        requestId: o.requestId,
        topic: o.topic,
        state: o.state,
        practiceArea: o.practiceArea,
        language: o.language,
        clientName: o.clientName,
        clientUsername: o.clientUsername,
        clientAvatarUrl: o.clientAvatarUrl,
      );

  final String requestId;

  /// Null while it rings (the line opens the call on «Ответить»).
  final String? callId;
  final String topic;
  final String state;
  final String practiceArea;
  final String language;
  final String? clientId;
  final String clientName;
  final String? clientUsername;
  final String? clientAvatarUrl;

  /// The id the offer rings under on the call screen.
  String get ringId => 'hotline:$requestId';

  /// Whether the call screen's call [id] is this hotline call.
  bool covers(String? id) => id != null && (id == ringId || id == callId);

  HotlineCallInfo withCall(String id, {String? clientId}) => HotlineCallInfo(
        requestId: requestId,
        callId: id,
        topic: topic,
        state: state,
        practiceArea: practiceArea,
        language: language,
        clientId: clientId ?? this.clientId,
        clientName: clientName,
        clientUsername: clientUsername,
        clientAvatarUrl: clientAvatarUrl,
      );
}

/// `hotline:case_offered` — the client pressed «Предложить дело» (mockup
/// a8): our bid form opens with the «Дело из звонка» card.
@immutable
class HotlineCaseOffered {
  const HotlineCaseOffered({
    required this.requestId,
    required this.caseId,
    required this.topic,
    required this.state,
    this.budgetCents,
  });

  static HotlineCaseOffered? fromEvent(Object? data) {
    if (data is! Map) return null;
    final caseId = _s(data['caseId']);
    if (caseId.isEmpty) return null;
    final budget = data['budgetCents'];
    return HotlineCaseOffered(
      requestId: _s(data['requestId']),
      caseId: caseId,
      topic: _s(data['topic']),
      state: _s(data['state']),
      budgetCents: budget is num ? budget.toInt() : null,
    );
  }

  final String requestId;
  final String caseId;
  final String topic;
  final String state;
  final int? budgetCents;
}

/// One row of «Сейчас по вашим темам» (banded: 0, 1 = есть, 10+, 50+…).
@immutable
class HotlineLineCounter {
  const HotlineLineCounter({
    required this.key,
    required this.lawyers,
    required this.clients,
  });

  final String key;
  final String lawyers;
  final String clients;
}
