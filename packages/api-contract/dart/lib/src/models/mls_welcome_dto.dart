// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'mls_welcome_dto.g.dart';

@JsonSerializable()
class MlsWelcomeDto {
  const MlsWelcomeDto({
    required this.id,
    required this.conversationId,
    required this.epoch,
    required this.welcome,
  });

  factory MlsWelcomeDto.fromJson(Map<String, Object?> json) =>
      _$MlsWelcomeDtoFromJson(json);

  final String id;
  final String conversationId;

  /// The epoch the device joins into.
  final num epoch;

  /// Base64 MLSMessage (mls_welcome).
  final String welcome;

  Map<String, Object?> toJson() => _$MlsWelcomeDtoToJson(this);
}
