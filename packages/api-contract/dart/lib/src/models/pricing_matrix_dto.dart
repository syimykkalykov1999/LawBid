// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'target_pricing_dto.dart';

part 'pricing_matrix_dto.g.dart';

@JsonSerializable()
class PricingMatrixDto {
  const PricingMatrixDto({
    required this.post,
    required this.video,
    required this.caseValue,
    required this.profile,
  });

  factory PricingMatrixDto.fromJson(Map<String, Object?> json) =>
      _$PricingMatrixDtoFromJson(json);

  final TargetPricingDto post;
  final TargetPricingDto video;

  /// The name has been replaced because it contains a keyword. Original name: `case`.
  @JsonKey(name: 'case')
  final TargetPricingDto caseValue;
  final TargetPricingDto profile;

  Map<String, Object?> toJson() => _$PricingMatrixDtoToJson(this);
}
