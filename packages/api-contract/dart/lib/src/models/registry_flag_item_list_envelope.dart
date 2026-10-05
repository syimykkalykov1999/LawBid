// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'registry_flag_item_dto.dart';
import 'response_meta_dto.dart';

part 'registry_flag_item_list_envelope.g.dart';

@JsonSerializable()
class RegistryFlagItemListEnvelope {
  const RegistryFlagItemListEnvelope({required this.data, this.meta});

  factory RegistryFlagItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$RegistryFlagItemListEnvelopeFromJson(json);

  final List<RegistryFlagItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RegistryFlagItemListEnvelopeToJson(this);
}
