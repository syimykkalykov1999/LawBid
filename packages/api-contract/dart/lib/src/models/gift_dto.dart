// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'gift_dto.g.dart';

@JsonSerializable()
class GiftDto {
  const GiftDto({
    required this.id,
    required this.title,
    required this.code,
    required this.priceStars,
    required this.url,
  });

  factory GiftDto.fromJson(Map<String, Object?> json) =>
      _$GiftDtoFromJson(json);

  final String id;
  final String title;

  /// Starter gift code: the app shows the translation gift.<code>.
  final String? code;
  final int priceStars;
  final String? url;

  Map<String, Object?> toJson() => _$GiftDtoToJson(this);
}
