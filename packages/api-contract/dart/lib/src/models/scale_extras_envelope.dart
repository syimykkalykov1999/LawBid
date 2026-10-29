// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'scale_extras_dto.dart';

part 'scale_extras_envelope.g.dart';

@JsonSerializable()
class ScaleExtrasEnvelope {
  const ScaleExtrasEnvelope({
    required this.data,
    this.meta,
  });
  
  factory ScaleExtrasEnvelope.fromJson(Map<String, Object?> json) => _$ScaleExtrasEnvelopeFromJson(json);
  
  final ScaleExtrasDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ScaleExtrasEnvelopeToJson(this);
}
