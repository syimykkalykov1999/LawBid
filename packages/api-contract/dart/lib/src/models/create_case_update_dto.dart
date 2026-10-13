// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_file_input_dto.dart';

part 'create_case_update_dto.g.dart';

@JsonSerializable()
class CreateCaseUpdateDto {
  const CreateCaseUpdateDto({required this.body, required this.files});

  factory CreateCaseUpdateDto.fromJson(Map<String, Object?> json) =>
      _$CreateCaseUpdateDtoFromJson(json);

  final String body;
  final List<CaseFileInputDto> files;

  Map<String, Object?> toJson() => _$CreateCaseUpdateDtoToJson(this);
}
