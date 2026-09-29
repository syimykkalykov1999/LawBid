// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'config_entry_dto.dart';
import 'response_meta_dto.dart';

part 'config_entry_list_envelope.g.dart';

@JsonSerializable()
class ConfigEntryListEnvelope {
  const ConfigEntryListEnvelope({required this.data, this.meta});

  factory ConfigEntryListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConfigEntryListEnvelopeFromJson(json);

  final List<ConfigEntryDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConfigEntryListEnvelopeToJson(this);
}
