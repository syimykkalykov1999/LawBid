// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'note_dto.g.dart';

@JsonSerializable()
class NoteDto {
  const NoteDto({required this.note});

  factory NoteDto.fromJson(Map<String, Object?> json) =>
      _$NoteDtoFromJson(json);

  final String note;

  Map<String, Object?> toJson() => _$NoteDtoToJson(this);
}
