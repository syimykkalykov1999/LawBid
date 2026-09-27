// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'auth_tokens_dto.g.dart';

@JsonSerializable()
class AuthTokensDto {
  const AuthTokensDto({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresIn,
    required this.isNewUser,
  });

  factory AuthTokensDto.fromJson(Map<String, Object?> json) =>
      _$AuthTokensDtoFromJson(json);

  /// Short-lived JWT access token (Bearer).
  final String accessToken;

  /// Opaque rotating refresh token; store in secure storage only.
  final String refreshToken;

  /// Access token lifetime in seconds.
  final int accessTokenExpiresIn;

  /// True when this call created the account.
  final bool isNewUser;

  Map<String, Object?> toJson() => _$AuthTokensDtoToJson(this);
}
