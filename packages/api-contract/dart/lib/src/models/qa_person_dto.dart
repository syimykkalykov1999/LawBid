// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'qa_person_dto.g.dart';

@JsonSerializable()
class QaPersonDto {
  const QaPersonDto({
    required this.id,
    required this.displayName,
    this.username,
    this.avatarUrl,
  });
  
  factory QaPersonDto.fromJson(Map<String, Object?> json) => _$QaPersonDtoFromJson(json);
  
  final String id;
  final String displayName;
  final String? username;
  final String? avatarUrl;

  Map<String, Object?> toJson() => _$QaPersonDtoToJson(this);
}
