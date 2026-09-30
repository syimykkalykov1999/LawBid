// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'requests_count_dto.g.dart';

@JsonSerializable()
class RequestsCountDto {
  const RequestsCountDto({required this.count});

  factory RequestsCountDto.fromJson(Map<String, Object?> json) =>
      _$RequestsCountDtoFromJson(json);

  final int count;

  Map<String, Object?> toJson() => _$RequestsCountDtoToJson(this);
}
