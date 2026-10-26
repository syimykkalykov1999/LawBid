// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_note_dto.g.dart';

@JsonSerializable()
class TrustNoteDto {
  const TrustNoteDto({this.note});

  factory TrustNoteDto.fromJson(Map<String, Object?> json) =>
      _$TrustNoteDtoFromJson(json);

  final String? note;

  Map<String, Object?> toJson() => _$TrustNoteDtoToJson(this);
}
