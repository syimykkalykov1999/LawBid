// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_decide_suggestion_result_dto_status.dart';

part 'staff_decide_suggestion_result_dto.g.dart';

@JsonSerializable()
class StaffDecideSuggestionResultDto {
  const StaffDecideSuggestionResultDto({
    required this.id,
    required this.status,
    required this.done,
  });

  factory StaffDecideSuggestionResultDto.fromJson(Map<String, Object?> json) =>
      _$StaffDecideSuggestionResultDtoFromJson(json);

  final String id;
  final StaffDecideSuggestionResultDtoStatus status;

  /// What was done, in words (e.g. «Снят с очереди до 3 ноября»).
  final String done;

  Map<String, Object?> toJson() => _$StaffDecideSuggestionResultDtoToJson(this);
}
