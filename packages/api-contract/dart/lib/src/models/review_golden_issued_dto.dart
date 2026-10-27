// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_golden_issued_dto.g.dart';

@JsonSerializable()
class ReviewGoldenIssuedDto {
  const ReviewGoldenIssuedDto({required this.ok, required this.goldenId});

  factory ReviewGoldenIssuedDto.fromJson(Map<String, Object?> json) =>
      _$ReviewGoldenIssuedDtoFromJson(json);

  final bool ok;
  final String goldenId;

  Map<String, Object?> toJson() => _$ReviewGoldenIssuedDtoToJson(this);
}
