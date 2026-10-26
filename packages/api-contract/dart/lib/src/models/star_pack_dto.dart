// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'star_pack_dto.g.dart';

@JsonSerializable()
class StarPackDto {
  const StarPackDto({
    required this.id,
    required this.stars,
    required this.priceCents,
  });

  factory StarPackDto.fromJson(Map<String, Object?> json) =>
      _$StarPackDtoFromJson(json);

  final String id;
  final int stars;

  /// US cents
  final int priceCents;

  Map<String, Object?> toJson() => _$StarPackDtoToJson(this);
}
