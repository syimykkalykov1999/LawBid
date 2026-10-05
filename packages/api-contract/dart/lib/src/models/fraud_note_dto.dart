// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'fraud_note_dto.g.dart';

@JsonSerializable()
class FraudNoteDto {
  const FraudNoteDto({this.note});

  factory FraudNoteDto.fromJson(Map<String, Object?> json) =>
      _$FraudNoteDtoFromJson(json);

  final String? note;

  Map<String, Object?> toJson() => _$FraudNoteDtoToJson(this);
}
