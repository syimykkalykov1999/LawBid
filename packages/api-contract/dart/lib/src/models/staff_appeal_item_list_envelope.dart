// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_appeal_item_dto.dart';

part 'staff_appeal_item_list_envelope.g.dart';

@JsonSerializable()
class StaffAppealItemListEnvelope {
  const StaffAppealItemListEnvelope({required this.data, this.meta});

  factory StaffAppealItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffAppealItemListEnvelopeFromJson(json);

  final List<StaffAppealItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffAppealItemListEnvelopeToJson(this);
}
