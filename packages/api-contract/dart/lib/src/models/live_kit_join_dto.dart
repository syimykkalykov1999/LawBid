// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'live_kit_join_dto_role.dart';

part 'live_kit_join_dto.g.dart';

@JsonSerializable()
class LiveKitJoinDto {
  const LiveKitJoinDto({
    required this.url,
    required this.token,
    required this.room,
    required this.identity,
    required this.role,
    required this.expiresAt,
  });

  factory LiveKitJoinDto.fromJson(Map<String, Object?> json) =>
      _$LiveKitJoinDtoFromJson(json);

  /// wss:// address of the LiveKit server.
  final String url;

  /// Access token (JWT); identity = your user id.
  final String token;

  /// Room name = the call id.
  final String room;
  final String identity;
  final LiveKitJoinDtoRole role;
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$LiveKitJoinDtoToJson(this);
}
