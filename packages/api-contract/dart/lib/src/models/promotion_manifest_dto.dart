// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'promotion_manifest_dto.g.dart';

@JsonSerializable()
class PromotionManifestDto {
  const PromotionManifestDto({
    required this.builtAt,
    required this.pages,
    required this.indexed,
    required this.noindex,
    required this.rampPerDay,
    required this.rampDeferred,
  });

  factory PromotionManifestDto.fromJson(Map<String, Object?> json) =>
      _$PromotionManifestDtoFromJson(json);

  /// Day of the last build (YYYY-MM-DD).
  final String? builtAt;
  final num pages;

  /// Pages in the sitemap (index,follow).
  final num indexed;

  /// Pages published as noindex.
  final num noindex;
  final num? rampPerDay;

  /// Pages held back by the daily ramp.
  final num? rampDeferred;

  Map<String, Object?> toJson() => _$PromotionManifestDtoToJson(this);
}
