// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promo_redemption_dto.dart';
import 'response_meta_dto.dart';

part 'promo_redemption_list_envelope.g.dart';

@JsonSerializable()
class PromoRedemptionListEnvelope {
  const PromoRedemptionListEnvelope({required this.data, this.meta});

  factory PromoRedemptionListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PromoRedemptionListEnvelopeFromJson(json);

  final List<PromoRedemptionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PromoRedemptionListEnvelopeToJson(this);
}
