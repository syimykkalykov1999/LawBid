// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'staff_decide_suggestion_result_dto.dart';

part 'staff_decide_suggestion_result_envelope.g.dart';

@JsonSerializable()
class StaffDecideSuggestionResultEnvelope {
  const StaffDecideSuggestionResultEnvelope({required this.data, this.meta});

  factory StaffDecideSuggestionResultEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$StaffDecideSuggestionResultEnvelopeFromJson(json);

  final StaffDecideSuggestionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$StaffDecideSuggestionResultEnvelopeToJson(this);
}
