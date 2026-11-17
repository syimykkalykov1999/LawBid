// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_bucket_row_dto.g.dart';

@JsonSerializable()
class HotlineBucketRowDto {
  const HotlineBucketRowDto({
    required this.bucket,
    required this.lawyers,
    required this.waiting,
  });

  factory HotlineBucketRowDto.fromJson(Map<String, Object?> json) =>
      _$HotlineBucketRowDtoFromJson(json);

  final String bucket;
  final num lawyers;
  final num waiting;

  Map<String, Object?> toJson() => _$HotlineBucketRowDtoToJson(this);
}
