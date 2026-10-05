// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'plans_list_dto.dart';
import 'response_meta_dto.dart';

part 'plans_list_envelope.g.dart';

@JsonSerializable()
class PlansListEnvelope {
  const PlansListEnvelope({required this.data, this.meta});

  factory PlansListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PlansListEnvelopeFromJson(json);

  final PlansListDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PlansListEnvelopeToJson(this);
}
