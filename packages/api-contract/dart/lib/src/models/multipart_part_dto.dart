// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'multipart_part_dto.g.dart';

@JsonSerializable()
class MultipartPartDto {
  const MultipartPartDto({required this.partNumber, required this.url});

  factory MultipartPartDto.fromJson(Map<String, Object?> json) =>
      _$MultipartPartDtoFromJson(json);

  /// 1-based part number.
  final num partNumber;

  /// Presigned link: PUT the raw bytes of this part (no extra headers).
  final String url;

  Map<String, Object?> toJson() => _$MultipartPartDtoToJson(this);
}
