// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'push_preview_key_dto.g.dart';

@JsonSerializable()
class PushPreviewKeyDto {
  const PushPreviewKeyDto({required this.kid, required this.key});

  factory PushPreviewKeyDto.fromJson(Map<String, Object?> json) =>
      _$PushPreviewKeyDtoFromJson(json);

  /// Key id: base64url of the first 12 bytes of SHA-256(key), 16 chars.
  final String kid;

  /// Raw X25519 public key, base64 (32 bytes).
  final String key;

  Map<String, Object?> toJson() => _$PushPreviewKeyDtoToJson(this);
}
