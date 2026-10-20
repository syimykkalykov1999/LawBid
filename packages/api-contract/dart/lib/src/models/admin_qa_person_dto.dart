// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_qa_person_dto.g.dart';

@JsonSerializable()
class AdminQaPersonDto {
  const AdminQaPersonDto({required this.id, required this.name});

  factory AdminQaPersonDto.fromJson(Map<String, Object?> json) =>
      _$AdminQaPersonDtoFromJson(json);

  final String id;
  final String name;

  Map<String, Object?> toJson() => _$AdminQaPersonDtoToJson(this);
}
