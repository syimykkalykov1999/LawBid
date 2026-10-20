import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Who may see or do something: `privacy_audience`.
enum Audience { everyone, contacts, nobody }

Audience _audience(api.PrivacyAudience a) => switch (a) {
      api.PrivacyAudience.everyone => Audience.everyone,
      api.PrivacyAudience.contacts => Audience.contacts,
      api.PrivacyAudience.nobody => Audience.nobody,
      // A value from a newer server: show the stricter of the known ones.
      _ => Audience.contacts,
    };

api.PrivacyAudience _wire(Audience a) => switch (a) {
      Audience.everyone => api.PrivacyAudience.everyone,
      Audience.contacts => api.PrivacyAudience.contacts,
      Audience.nobody => api.PrivacyAudience.nobody,
    };

/// `GET /users/me/privacy` (owner 2026-10-20).
@immutable
class PrivacySettings {
  const PrivacySettings({
    required this.lastSeen,
    required this.messageFrom,
    required this.callFrom,
    this.photoFrom = Audience.everyone,
    this.aboutFrom = Audience.everyone,
    this.groupAddFrom = Audience.everyone,
  });

  final Audience lastSeen;
  final Audience messageFrom;
  final Audience callFrom;
  final Audience photoFrom;
  final Audience aboutFrom;
  final Audience groupAddFrom;

  PrivacySettings copyWith({
    Audience? lastSeen,
    Audience? messageFrom,
    Audience? callFrom,
    Audience? photoFrom,
    Audience? aboutFrom,
    Audience? groupAddFrom,
  }) =>
      PrivacySettings(
        lastSeen: lastSeen ?? this.lastSeen,
        messageFrom: messageFrom ?? this.messageFrom,
        callFrom: callFrom ?? this.callFrom,
        photoFrom: photoFrom ?? this.photoFrom,
        aboutFrom: aboutFrom ?? this.aboutFrom,
        groupAddFrom: groupAddFrom ?? this.groupAddFrom,
      );
}

/// Which of the three settings a change touches.
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
String _camel(String s) => s.replaceAllMapped(
      RegExp('_([a-z])'),
      (m) => m.group(1)!.toUpperCase(),
    );

/// Throws [ApiException].
abstract interface class PrivacyRepository {
  Future<PrivacySettings> settings();
  Future<PrivacySettings> change(PrivacyField field, Audience value);
  Future<List<ModerationNotice>> notices();
  Future<ModerationNotice> appeal(String actionId, String message);
  Future<List<MyReport>> myReports();
}

class ApiPrivacyRepository implements PrivacyRepository {
  ApiPrivacyRepository(Dio dio)
      : _privacy = api.PrivacyClient(dio),
        _moderation = api.ModerationClient(dio),
        _reports = api.ReportsClient(dio);

  final api.PrivacyClient _privacy;
  final api.ModerationClient _moderation;
  final api.ReportsClient _reports;

  PrivacySettings _settings(api.PrivacySettingsDto d) => PrivacySettings(
        lastSeen: _audience(d.lastSeen),
        messageFrom: _audience(d.messageFrom),
        callFrom: _audience(d.callFrom),
        photoFrom: _audience(d.photoFrom),
        aboutFrom: _audience(d.aboutFrom),
        groupAddFrom: _audience(d.groupAddFrom),
      );

  @override
  Future<PrivacySettings> settings() async =>
      _settings((await guardApiCall(_privacy.getPrivacySettings)).data);

  @override
  Future<PrivacySettings> change(PrivacyField field, Audience value) async {
    final body = switch (field) {
      PrivacyField.lastSeen =>
        api.UpdatePrivacySettingsDto(lastSeen: _wire(value)),
      PrivacyField.messageFrom =>
        api.UpdatePrivacySettingsDto(messageFrom: _wire(value)),
      PrivacyField.callFrom =>
        api.UpdatePrivacySettingsDto(callFrom: _wire(value)),
      PrivacyField.photoFrom =>
        api.UpdatePrivacySettingsDto(photoFrom: _wire(value)),
      PrivacyField.aboutFrom =>
        api.UpdatePrivacySettingsDto(aboutFrom: _wire(value)),
      PrivacyField.groupAddFrom =>
        api.UpdatePrivacySettingsDto(groupAddFrom: _wire(value)),
    };
    return _settings(
      (await guardApiCall(() => _privacy.updatePrivacySettings(body: body)))
          .data,
    );
  }

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
