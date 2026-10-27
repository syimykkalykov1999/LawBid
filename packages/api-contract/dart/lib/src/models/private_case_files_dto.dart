// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'private_case_file_dto.dart';

part 'private_case_files_dto.g.dart';

@JsonSerializable()
class PrivateCaseFilesDto {
  const PrivateCaseFilesDto({required this.items});

  factory PrivateCaseFilesDto.fromJson(Map<String, Object?> json) =>
      _$PrivateCaseFilesDtoFromJson(json);

  final List<PrivateCaseFileDto> items;

  Map<String, Object?> toJson() => _$PrivateCaseFilesDtoToJson(this);
}
