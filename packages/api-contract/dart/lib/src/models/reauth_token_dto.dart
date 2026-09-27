// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reauth_token_dto.g.dart';

@JsonSerializable()
class ReauthTokenDto {
  const ReauthTokenDto({required this.reauthToken});

  factory ReauthTokenDto.fromJson(Map<String, Object?> json) =>
      _$ReauthTokenDtoFromJson(json);

  /// Single-use token for the X-Reauth-Token header of a sensitive action; expires after REAUTH_TOKEN_TTL_SECONDS (5 min).
  final String reauthToken;

  Map<String, Object?> toJson() => _$ReauthTokenDtoToJson(this);
}
