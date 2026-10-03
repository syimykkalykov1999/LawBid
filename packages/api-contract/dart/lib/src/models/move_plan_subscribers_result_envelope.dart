// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'move_plan_subscribers_result_dto.dart';
import 'response_meta_dto.dart';

part 'move_plan_subscribers_result_envelope.g.dart';

@JsonSerializable()
class MovePlanSubscribersResultEnvelope {
  const MovePlanSubscribersResultEnvelope({required this.data, this.meta});

  factory MovePlanSubscribersResultEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$MovePlanSubscribersResultEnvelopeFromJson(json);

  final MovePlanSubscribersResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$MovePlanSubscribersResultEnvelopeToJson(this);
}
