// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'private_case_file_dto.g.dart';

@JsonSerializable()
class PrivateCaseFileDto {
  const PrivateCaseFileDto({
    required this.fileId,
    required this.mime,
    required this.sizeBytes,
    required this.description,
    required this.createdAt,
  });

  factory PrivateCaseFileDto.fromJson(Map<String, Object?> json) =>
      _$PrivateCaseFileDtoFromJson(json);

  final String fileId;
  final String mime;
  final num sizeBytes;
  final String? description;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$PrivateCaseFileDtoToJson(this);
}
