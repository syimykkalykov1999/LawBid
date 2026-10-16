// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_preset_dto.dart';
import 'response_meta_dto.dart';

part 'admin_preset_list_envelope.g.dart';

@JsonSerializable()
class AdminPresetListEnvelope {
  const AdminPresetListEnvelope({required this.data, this.meta});

  factory AdminPresetListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminPresetListEnvelopeFromJson(json);

  final List<AdminPresetDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminPresetListEnvelopeToJson(this);
}
