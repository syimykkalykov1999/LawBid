// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_audience_dto_role.dart';

part 'promotion_audience_dto.g.dart';

@JsonSerializable()
class PromotionAudienceDto {
  const PromotionAudienceDto({
    required this.states,
    required this.countries,
    required this.topics,
    this.role = PromotionAudienceDtoRole.all,
  });

  factory PromotionAudienceDto.fromJson(Map<String, Object?> json) =>
      _$PromotionAudienceDtoFromJson(json);

  final PromotionAudienceDtoRole role;

  /// US state codes.
  final List<String> states;

  /// Country codes.
  final List<String> countries;

  /// Practice category codes.
  final List<String> topics;

  Map<String, Object?> toJson() => _$PromotionAudienceDtoToJson(this);
}
