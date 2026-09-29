// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'work_item_dto.dart';

part 'work_item_list_envelope.g.dart';

@JsonSerializable()
class WorkItemListEnvelope {
  const WorkItemListEnvelope({required this.data, this.meta});

  factory WorkItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$WorkItemListEnvelopeFromJson(json);

  final List<WorkItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$WorkItemListEnvelopeToJson(this);
}
