// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stars_purchase_dto.dart';

part 'stars_purchase_envelope.g.dart';

@JsonSerializable()
class StarsPurchaseEnvelope {
  const StarsPurchaseEnvelope({
    required this.data,
    this.meta,
  });
  
  factory StarsPurchaseEnvelope.fromJson(Map<String, Object?> json) => _$StarsPurchaseEnvelopeFromJson(json);
  
  final StarsPurchaseDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StarsPurchaseEnvelopeToJson(this);
}
