// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'push_token_dto_platform.dart';

part 'push_token_dto.g.dart';

@JsonSerializable()
class PushTokenDto {
  const PushTokenDto({required this.token, required this.platform});

  factory PushTokenDto.fromJson(Map<String, Object?> json) =>
      _$PushTokenDtoFromJson(json);

  /// FCM registration token.
  final String token;
  final PushTokenDtoPlatform platform;

  Map<String, Object?> toJson() => _$PushTokenDtoToJson(this);
}
