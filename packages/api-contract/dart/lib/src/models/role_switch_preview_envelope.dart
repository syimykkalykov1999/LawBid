// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'role_switch_preview_dto.dart';

part 'role_switch_preview_envelope.g.dart';

@JsonSerializable()
class RoleSwitchPreviewEnvelope {
  const RoleSwitchPreviewEnvelope({required this.data, this.meta});

  factory RoleSwitchPreviewEnvelope.fromJson(Map<String, Object?> json) =>
      _$RoleSwitchPreviewEnvelopeFromJson(json);

  final RoleSwitchPreviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RoleSwitchPreviewEnvelopeToJson(this);
}
