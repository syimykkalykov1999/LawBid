// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sealed_push_preview_dto.g.dart';

@JsonSerializable()
class SealedPushPreviewDto {
  const SealedPushPreviewDto({required this.keyId, required this.sealedValue});

  factory SealedPushPreviewDto.fromJson(Map<String, Object?> json) =>
      _$SealedPushPreviewDtoFromJson(json);

  /// The id of the key it is sealed to (ConversationE2eeDto.previewKeys).
  final String keyId;

  /// Base64 HPKE output (enc || ciphertext || tag), RFC 9180 base mode, DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / ChaCha20Poly1305; info = "lawbid push preview v1" || 0x00 || conversation id.
  /// The name has been replaced because it contains a keyword. Original name: `sealed`.
  @JsonKey(name: 'sealed')
  final String sealedValue;

  Map<String, Object?> toJson() => _$SealedPushPreviewDtoToJson(this);
}
