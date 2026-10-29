// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sfu_publish_failed_dto.g.dart';

@JsonSerializable()
class SfuPublishFailedDto {
  const SfuPublishFailedDto({
    required this.trackName,
    required this.errorCode,
  });
  
  factory SfuPublishFailedDto.fromJson(Map<String, Object?> json) => _$SfuPublishFailedDtoFromJson(json);
  
  final String trackName;
  final String errorCode;

  Map<String, Object?> toJson() => _$SfuPublishFailedDtoToJson(this);
}
