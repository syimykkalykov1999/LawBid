// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'activity_dto.dart';
import 'response_meta_dto.dart';

part 'activity_list_envelope.g.dart';

@JsonSerializable()
class ActivityListEnvelope {
  const ActivityListEnvelope({required this.data, this.meta});

  factory ActivityListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ActivityListEnvelopeFromJson(json);

  final List<ActivityDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ActivityListEnvelopeToJson(this);
}
