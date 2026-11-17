// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'social_nonce_dto.g.dart';

@JsonSerializable()
class SocialNonceDto {
  const SocialNonceDto({required this.nonce, required this.expiresAt});

  factory SocialNonceDto.fromJson(Map<String, Object?> json) =>
      _$SocialNonceDtoFromJson(json);

  /// One-time nonce to hand to Google sign-in and send back as `nonce` of POST /auth/social (or Google linking). Works once.
  final String nonce;

  /// After this the nonce is refused (admin auth.social_nonce_ttl_sec).
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$SocialNonceDtoToJson(this);
}
