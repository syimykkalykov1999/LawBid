// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stars_overview_dto.dart';

part 'stars_overview_envelope.g.dart';

@JsonSerializable()
class StarsOverviewEnvelope {
  const StarsOverviewEnvelope({
    required this.data,
    this.meta,
  });
  
  factory StarsOverviewEnvelope.fromJson(Map<String, Object?> json) => _$StarsOverviewEnvelopeFromJson(json);
  
  final StarsOverviewDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StarsOverviewEnvelopeToJson(this);
}
