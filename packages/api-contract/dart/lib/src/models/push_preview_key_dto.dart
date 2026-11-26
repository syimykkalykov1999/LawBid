// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'push_preview_key_dto.g.dart';

@JsonSerializable()
class PushPreviewKeyDto {
  const PushPreviewKeyDto({
    required this.userId,
    required this.keyId,
    required this.publicKey,
  });

  factory PushPreviewKeyDto.fromJson(Map<String, Object?> json) =>
      _$PushPreviewKeyDtoFromJson(json);

  final String userId;

  /// The key’s id (base64url of the first 12 bytes of its SHA-256); a sealed preview is sent under it.
  final String keyId;

  /// Base64 X25519 public key (32 bytes).
  final String publicKey;

  Map<String, Object?> toJson() => _$PushPreviewKeyDtoToJson(this);
}
