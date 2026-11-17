// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_addon_preview_dto.dart';
import 'response_meta_dto.dart';

part 'hotline_addon_preview_envelope.g.dart';

@JsonSerializable()
class HotlineAddonPreviewEnvelope {
  const HotlineAddonPreviewEnvelope({required this.data, this.meta});

  factory HotlineAddonPreviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$HotlineAddonPreviewEnvelopeFromJson(json);

  final HotlineAddonPreviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$HotlineAddonPreviewEnvelopeToJson(this);
}
