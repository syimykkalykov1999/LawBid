import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Who may see or do something. Owner 2026-10-28: each setting is a set
/// (`<field>Audiences` on the server); the sheet lists them in this order.
enum Audience { everyone, followers, following, contacts, nobody }

/// The three a server before 2026-10-28 knows.
const legacyAudiences = [Audience.everyone, Audience.contacts, Audience.nobody];

/// One setting from the raw answer: the set when the server sends it, else
/// the old single value (an unknown one shows as the stricter «contacts»).
Set<Audience> _audiences(Map<String, Object?> json, String field) {
  final set = json['${field}Audiences'];
  if (set is List) {
    final out = <Audience>{
      for (final v in set)
        for (final a in Audience.values)
          if (a.name == v) a,
    };
    if (out.isNotEmpty) return out;
  }
  return {
    switch (json[field]) {
      'everyone' || null => Audience.everyone,
      'nobody' => Audience.nobody,
      _ => Audience.contacts,
    },
  };
}

/// The closest old value, for a server before 2026-10-28.
String _legacy(Audience a) => switch (a) {
      Audience.everyone => 'everyone',
      Audience.nobody => 'nobody',
      _ => 'contacts',
    };

/// `GET /users/me/privacy` (owner 2026-10-20).
@immutable
class PrivacySettings {
  const PrivacySettings({
    required this.lastSeen,
    required this.messageFrom,
    required this.callFrom,
    this.photoFrom = const {Audience.everyone},
    this.aboutFrom = const {Audience.everyone},
    this.groupAddFrom = const {Audience.everyone},
    this.doNotSell = false,
    this.followAudiences = false,
  });

  final Set<Audience> lastSeen;
  final Set<Audience> messageFrom;
  final Set<Audience> callFrom;
  final Set<Audience> photoFrom;
  final Set<Audience> aboutFrom;
  final Set<Audience> groupAddFrom;

  /// Owner 2026-10-22 (CCPA): «Do not sell or share my personal
  /// information» — `PATCH /users/me/privacy { doNotSell }`.
  final bool doNotSell;

  /// The server knows followers / following (sends `<field>Audiences`).
  /// False on a server one version older: only the old three are offered.
  final bool followAudiences;

  Set<Audience> of(PrivacyField field) => switch (field) {
        PrivacyField.lastSeen => lastSeen,
        PrivacyField.messageFrom => messageFrom,
        PrivacyField.callFrom => callFrom,
        PrivacyField.photoFrom => photoFrom,
        PrivacyField.aboutFrom => aboutFrom,
        PrivacyField.groupAddFrom => groupAddFrom,
      };

  /// [field] set to [value].
  PrivacySettings withField(PrivacyField field, Set<Audience> value) =>
      PrivacySettings(
        lastSeen: field == PrivacyField.lastSeen ? value : lastSeen,
        messageFrom: field == PrivacyField.messageFrom ? value : messageFrom,
        callFrom: field == PrivacyField.callFrom ? value : callFrom,
        photoFrom: field == PrivacyField.photoFrom ? value : photoFrom,
        aboutFrom: field == PrivacyField.aboutFrom ? value : aboutFrom,
        groupAddFrom: field == PrivacyField.groupAddFrom ? value : groupAddFrom,
        doNotSell: doNotSell,
        followAudiences: followAudiences,
      );

  PrivacySettings copyWith({bool? doNotSell}) => PrivacySettings(
        lastSeen: lastSeen,
        messageFrom: messageFrom,
        callFrom: callFrom,
        photoFrom: photoFrom,
        aboutFrom: aboutFrom,
        groupAddFrom: groupAddFrom,
        doNotSell: doNotSell ?? this.doNotSell,
        followAudiences: followAudiences,
      );
}

/// Which setting a change touches (named as on the server).
enum PrivacyField {
  lastSeen,
  messageFrom,
  callFrom,
  photoFrom,
  aboutFrom,
  groupAddFrom,
}

/// What moderation did with an object of mine (`GET /moderation/notices`).
@immutable
class ModerationNotice {
  const ModerationNotice({
    required this.actionId,
    required this.action,
    required this.targetType,
    required this.createdAt,
    required this.canAppeal,
    this.reason,
    this.excerpt,
    this.appealStatus,
    this.appealNote,
  });

  final String actionId;

  /// hide / remove / warn / restore.
  final String action;

  /// post / comment / case_comment / message / user.
  final String targetType;
  final String? reason;
  final String? excerpt;
  final DateTime createdAt;
  final bool canAppeal;

  /// pending / accepted / rejected, or null when never appealed.
  final String? appealStatus;
  final String? appealNote;
}

/// A report I made, with where it stands (`GET /reports/mine`).
@immutable
class MyReport {
  const MyReport({
    required this.id,
    required this.targetType,
    required this.reason,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String targetType;

  /// `report.reason.<name>`, camel-cased like the app's enum.
  final String reason;

  /// open / actioned / dismissed.
  final String status;
  final DateTime createdAt;
}

/// snake_case → camelCase (`self_harm` → `selfHarm`).
String _camel(String s) =>
    s.replaceAllMapped(RegExp('_([a-z])'), (m) => m.group(1)!.toUpperCase());

/// Throws [ApiException].
abstract interface class PrivacyRepository {
  Future<PrivacySettings> settings();

  /// [followAudiences]: the server takes `<field>Audiences` (else the old
  /// single value is sent).
  Future<PrivacySettings> change(
    PrivacyField field,
    Audience value, {
    required bool followAudiences,
  });

  /// Owner 2026-10-22 (CCPA): `PATCH /users/me/privacy { doNotSell }`.
  Future<PrivacySettings> setDoNotSell({required bool value});
  Future<List<ModerationNotice>> notices();
  Future<ModerationNotice> appeal(String actionId, String message);
  Future<List<MyReport>> myReports();
}

class ApiPrivacyRepository implements PrivacyRepository {
  ApiPrivacyRepository(Dio dio)
      : _dio = dio,
        _moderation = api.ModerationClient(dio),
        _reports = api.ReportsClient(dio);

  final Dio _dio;
  final api.ModerationClient _moderation;
  final api.ReportsClient _reports;

  /// The raw body (`{data: {...}}`): read by hand so a field the generated
  /// DTO does not know yet, or no longer requires, never fails the screen.
  PrivacySettings _fromBody(Object? body) {
    final map = body is Map ? Map<String, Object?>.from(body) : null;
    final data = map?['data'];
    if (data is! Map) {
      throw const FormatException('privacy settings: no data');
    }
    final json = Map<String, Object?>.from(data);
    Set<Audience> f(PrivacyField p) => _audiences(json, p.name);
    return PrivacySettings(
      lastSeen: f(PrivacyField.lastSeen),
      messageFrom: f(PrivacyField.messageFrom),
      callFrom: f(PrivacyField.callFrom),
      photoFrom: f(PrivacyField.photoFrom),
      aboutFrom: f(PrivacyField.aboutFrom),
      groupAddFrom: f(PrivacyField.groupAddFrom),
      doNotSell: json['doNotSell'] == true,
      followAudiences: json['lastSeenAudiences'] is List,
    );
  }

  @override
  Future<PrivacySettings> settings() => guardApiCall(() async {
        final r = await _dio.get<Object?>('/users/me/privacy');
        return _fromBody(r.data);
      });

  @override
  Future<PrivacySettings> setDoNotSell({required bool value}) =>
      guardApiCall(() async {
        final r = await _dio.patch<Object?>(
          '/users/me/privacy',
          data: {'doNotSell': value},
        );
        try {
          return _fromBody(r.data);
        } on FormatException {
          // An answer without the settings body: read them back.
          return (await settings()).copyWith(doNotSell: value);
        }
      });

  @override
  Future<PrivacySettings> change(
    PrivacyField field,
    Audience value, {
    required bool followAudiences,
  }) =>
      guardApiCall(() async {
        final r = await _dio.patch<Object?>(
          '/users/me/privacy',
          data: followAudiences
              ? {
                  '${field.name}Audiences': [value.name],
                }
              : {field.name: _legacy(value)},
        );
        return _fromBody(r.data);
      });

  ModerationNotice _notice(api.ModerationNoticeDto d) => ModerationNotice(
        actionId: d.actionId,
        action: d.action.name,
        targetType: d.targetType.name,
        reason: d.reason,
        excerpt: d.excerpt,
        createdAt: d.createdAt,
        canAppeal: d.canAppeal,
        appealStatus: d.appealStatus?.name,
        appealNote: d.appealNote,
      );

  @override
  Future<List<ModerationNotice>> notices() async =>
      (await guardApiCall(_moderation.moderationNotices))
          .data
          .map(_notice)
          .toList(growable: false);

  @override
  Future<ModerationNotice> appeal(String actionId, String message) async =>
      _notice(
        (await guardApiCall(
          () => _moderation.createModerationAppeal(
            body: api.CreateAppealDto(actionId: actionId, message: message),
          ),
        ))
            .data,
      );

  @override
  Future<List<MyReport>> myReports() async =>
      (await guardApiCall(_reports.listMyReports))
          .data
          .map(
            (d) => MyReport(
              id: d.id,
              targetType: d.targetType.name,
              reason: _camel(d.reason),
              status: d.status.name,
              createdAt: d.createdAt,
            ),
          )
          .toList(growable: false);
}
