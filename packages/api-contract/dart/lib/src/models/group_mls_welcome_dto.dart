// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'group_mls_welcome_dto.g.dart';

@JsonSerializable()
class GroupMlsWelcomeDto {
  const GroupMlsWelcomeDto({
    required this.id,
    required this.groupId,
    required this.epoch,
    required this.welcome,
  });

  factory GroupMlsWelcomeDto.fromJson(Map<String, Object?> json) =>
      _$GroupMlsWelcomeDtoFromJson(json);

  final String id;
  final String groupId;

  /// The epoch the device joins into.
  final num epoch;

  /// Base64 MLSMessage (mls_welcome).
  final String welcome;

  Map<String, Object?> toJson() => _$GroupMlsWelcomeDtoToJson(this);
}
