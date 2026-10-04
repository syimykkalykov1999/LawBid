// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'public_pricing_dto.dart';
import 'response_meta_dto.dart';

part 'public_pricing_envelope.g.dart';

@JsonSerializable()
class PublicPricingEnvelope {
  const PublicPricingEnvelope({required this.data, this.meta});

  factory PublicPricingEnvelope.fromJson(Map<String, Object?> json) =>
      _$PublicPricingEnvelopeFromJson(json);

  final PublicPricingDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PublicPricingEnvelopeToJson(this);
}
