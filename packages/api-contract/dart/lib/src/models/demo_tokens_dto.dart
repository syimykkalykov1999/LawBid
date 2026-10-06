// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'demo_tokens_dto.g.dart';

@JsonSerializable()
class DemoTokensDto {
  const DemoTokensDto({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresIn,
  });

  factory DemoTokensDto.fromJson(Map<String, Object?> json) =>
      _$DemoTokensDtoFromJson(json);

  final String accessToken;
  final String refreshToken;
  final num accessTokenExpiresIn;

  Map<String, Object?> toJson() => _$DemoTokensDtoToJson(this);
}
