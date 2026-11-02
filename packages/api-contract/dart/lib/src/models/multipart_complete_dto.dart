// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'multipart_complete_dto.g.dart';

@JsonSerializable()
class MultipartCompleteDto {
  const MultipartCompleteDto({required this.sizeBytes});

  factory MultipartCompleteDto.fromJson(Map<String, Object?> json) =>
      _$MultipartCompleteDtoFromJson(json);

  /// Size of the assembled object in bytes.
  final num sizeBytes;

  Map<String, Object?> toJson() => _$MultipartCompleteDtoToJson(this);
}
