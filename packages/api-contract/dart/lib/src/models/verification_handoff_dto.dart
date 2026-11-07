// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'verification_handoff_dto.g.dart';

@JsonSerializable()
class VerificationHandoffDto {
  const VerificationHandoffDto({
    required this.token,
    required this.url,
    required this.qrPayload,
    required this.expiresAt,
  });

  factory VerificationHandoffDto.fromJson(Map<String, Object?> json) =>
      _$VerificationHandoffDtoFromJson(json);

  /// One-time code (base64url), valid 10 minutes.
  final String token;

  /// Short link that opens the selfie step of this request in the app (APP_LINK_BASE_URL/selfie/<token>).
  final String url;

  /// What the QR code carries (= url).
  final String qrPayload;
  final DateTime expiresAt;

  Map<String, Object?> toJson() => _$VerificationHandoffDtoToJson(this);
}
