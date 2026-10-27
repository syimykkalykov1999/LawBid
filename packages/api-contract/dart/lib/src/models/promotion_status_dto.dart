// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'promotion_manifest_dto.dart';

part 'promotion_status_dto.g.dart';

@JsonSerializable()
class PromotionStatusDto {
  const PromotionStatusDto({
    required this.manifestUrl,
    required this.manifest,
    required this.error,
    required this.checkedAt,
  });

  factory PromotionStatusDto.fromJson(Map<String, Object?> json) =>
      _$PromotionStatusDtoFromJson(json);

  final String manifestUrl;
  final PromotionManifestDto? manifest;

  /// Why there is no manifest (not published yet, unreachable).
  final String? error;

  /// ISO time the answer was read (cached 10 min).
  final String checkedAt;

  Map<String, Object?> toJson() => _$PromotionStatusDtoToJson(this);
}
