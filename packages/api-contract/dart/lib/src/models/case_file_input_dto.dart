// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'case_file_input_dto.g.dart';

@JsonSerializable()
class CaseFileInputDto {
  const CaseFileInputDto({required this.fileId, this.sample, this.description});

  factory CaseFileInputDto.fromJson(Map<String, Object?> json) =>
      _$CaseFileInputDtoFromJson(json);

  final String fileId;

  /// A sample / form, not the answer itself.
  final bool? sample;
  final String? description;

  Map<String, Object?> toJson() => _$CaseFileInputDtoToJson(this);
}
