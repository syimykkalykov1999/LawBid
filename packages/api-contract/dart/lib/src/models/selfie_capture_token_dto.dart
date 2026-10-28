// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'selfie_capture_token_dto.g.dart';

@JsonSerializable()
class SelfieCaptureTokenDto {
  const SelfieCaptureTokenDto({
    required this.token,
    required this.expiresAt,
    required this.requiredValue,
  });

  factory SelfieCaptureTokenDto.fromJson(Map<String, Object?> json) =>
      _$SelfieCaptureTokenDtoFromJson(json);

  /// Send back as captureToken with the selfie.
  final String token;
  final DateTime expiresAt;

  /// verification.selfie_live_capture_required: false = the server also accepts a selfie without the token.
  /// The name has been replaced because it contains a keyword. Original name: `required`.
  @JsonKey(name: 'required')
  final bool requiredValue;

  Map<String, Object?> toJson() => _$SelfieCaptureTokenDtoToJson(this);
}
