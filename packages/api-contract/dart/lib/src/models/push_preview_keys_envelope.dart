// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'push_preview_keys_dto.dart';
import 'response_meta_dto.dart';

part 'push_preview_keys_envelope.g.dart';

@JsonSerializable()
class PushPreviewKeysEnvelope {
  const PushPreviewKeysEnvelope({required this.data, this.meta});

  factory PushPreviewKeysEnvelope.fromJson(Map<String, Object?> json) =>
      _$PushPreviewKeysEnvelopeFromJson(json);

  final PushPreviewKeysDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PushPreviewKeysEnvelopeToJson(this);
}
