// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_suggestion_list_dto.dart';

part 'staff_suggestion_list_envelope.g.dart';

@JsonSerializable()
class StaffSuggestionListEnvelope {
  const StaffSuggestionListEnvelope({required this.data, this.meta});

  factory StaffSuggestionListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StaffSuggestionListEnvelopeFromJson(json);

  final StaffSuggestionListDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StaffSuggestionListEnvelopeToJson(this);
}
