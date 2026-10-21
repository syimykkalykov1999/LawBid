// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'ongoing_group_call_dto.dart';
import 'response_meta_dto.dart';

part 'ongoing_group_call_list_envelope.g.dart';

@JsonSerializable()
class OngoingGroupCallListEnvelope {
  const OngoingGroupCallListEnvelope({required this.data, this.meta});

  factory OngoingGroupCallListEnvelope.fromJson(Map<String, Object?> json) =>
      _$OngoingGroupCallListEnvelopeFromJson(json);

  final List<OngoingGroupCallDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$OngoingGroupCallListEnvelopeToJson(this);
}
