// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'review_golden_row_dto.dart';

part 'review_golden_list_dto.g.dart';

@JsonSerializable()
class ReviewGoldenListDto {
  const ReviewGoldenListDto({required this.items});

  factory ReviewGoldenListDto.fromJson(Map<String, Object?> json) =>
      _$ReviewGoldenListDtoFromJson(json);

  final List<ReviewGoldenRowDto> items;

  Map<String, Object?> toJson() => _$ReviewGoldenListDtoToJson(this);
}
