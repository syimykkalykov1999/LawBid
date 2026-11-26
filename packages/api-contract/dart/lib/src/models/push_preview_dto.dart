// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'push_preview_dto.g.dart';

@JsonSerializable()
class PushPreviewDto {
  const PushPreviewDto({required this.kid, required this.ct});

  factory PushPreviewDto.fromJson(Map<String, Object?> json) =>
      _$PushPreviewDtoFromJson(json);

  /// Id of the recipient key (GET /e2ee/conversations/:id/push-keys).
  final String kid;

  /// base64 of HPKE enc (32 bytes) || ciphertext.
  final String ct;

  Map<String, Object?> toJson() => _$PushPreviewDtoToJson(this);
}
