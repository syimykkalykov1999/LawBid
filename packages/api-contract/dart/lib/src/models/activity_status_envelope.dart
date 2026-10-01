// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'activity_status_dto.dart';
import 'response_meta_dto.dart';

part 'activity_status_envelope.g.dart';

@JsonSerializable()
class ActivityStatusEnvelope {
  const ActivityStatusEnvelope({required this.data, this.meta});

  factory ActivityStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$ActivityStatusEnvelopeFromJson(json);

  final ActivityStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ActivityStatusEnvelopeToJson(this);
}
