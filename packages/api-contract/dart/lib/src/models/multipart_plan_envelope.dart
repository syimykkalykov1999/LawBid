// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'multipart_plan_dto.dart';
import 'response_meta_dto.dart';

part 'multipart_plan_envelope.g.dart';

@JsonSerializable()
class MultipartPlanEnvelope {
  const MultipartPlanEnvelope({required this.data, this.meta});

  factory MultipartPlanEnvelope.fromJson(Map<String, Object?> json) =>
      _$MultipartPlanEnvelopeFromJson(json);

  final MultipartPlanDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MultipartPlanEnvelopeToJson(this);
}
