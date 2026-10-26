// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'badges_dto.dart';
import 'client_timings_dto.dart';
import 'me_dto.dart';

part 'app_session_dto.g.dart';

@JsonSerializable()
class AppSessionDto {
  const AppSessionDto({
    required this.me,
    required this.badges,
    required this.bootstrapVersion,
    required this.flags,
    required this.unreadSupport,
    required this.hasOngoingCalls,
    required this.client,
  });

  factory AppSessionDto.fromJson(Map<String, Object?> json) =>
      _$AppSessionDtoFromJson(json);

  final MeDto me;
  final BadgesDto badges;

  /// The server config version (flags, app_config, legal documents). When it differs from the one you stored, re-read GET /config/bootstrap.
  final String bootstrapVersion;

  /// The same gated flags GET /config/bootstrap answers.
  final Map<String, bool> flags;

  /// Support tickets with an unread answer from the team.
  final int unreadSupport;

  /// A call is running now in one of my groups — only then ask GET /calls/ongoing.
  final bool hasOngoingCalls;

  /// The same `client.timings` GET /config/bootstrap answers (connection timings).
  final ClientTimingsDto client;

  Map<String, Object?> toJson() => _$AppSessionDtoToJson(this);
}
