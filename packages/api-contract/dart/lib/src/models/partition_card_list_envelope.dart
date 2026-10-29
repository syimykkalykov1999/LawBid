// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partition_card_dto.dart';
import 'response_meta_dto.dart';

part 'partition_card_list_envelope.g.dart';

@JsonSerializable()
class PartitionCardListEnvelope {
  const PartitionCardListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory PartitionCardListEnvelope.fromJson(Map<String, Object?> json) => _$PartitionCardListEnvelopeFromJson(json);
  
  final List<PartitionCardDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PartitionCardListEnvelopeToJson(this);
}
