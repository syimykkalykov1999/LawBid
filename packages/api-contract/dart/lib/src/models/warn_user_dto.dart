// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'warn_user_dto.g.dart';

@JsonSerializable()
class WarnUserDto {
  const WarnUserDto({required this.reason});

  factory WarnUserDto.fromJson(Map<String, Object?> json) =>
      _$WarnUserDtoFromJson(json);

  /// Internal reason (audit + moderation_actions); the user gets the moderation_notice template.
  final String reason;

  Map<String, Object?> toJson() => _$WarnUserDtoToJson(this);
}
