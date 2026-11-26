// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'push_preview_key_dto.dart';

part 'push_preview_keys_dto.g.dart';

@JsonSerializable()
class PushPreviewKeysDto {
  const PushPreviewKeysDto({required this.keys});

  factory PushPreviewKeysDto.fromJson(Map<String, Object?> json) =>
      _$PushPreviewKeysDtoFromJson(json);

  final List<PushPreviewKeyDto> keys;

  Map<String, Object?> toJson() => _$PushPreviewKeysDtoToJson(this);
}
