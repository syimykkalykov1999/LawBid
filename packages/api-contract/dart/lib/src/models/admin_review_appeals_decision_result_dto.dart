// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_review_appeals_decision_result_dto.g.dart';

@JsonSerializable()
class AdminReviewAppealsDecisionResultDto {
  const AdminReviewAppealsDecisionResultDto({required this.decided});

  factory AdminReviewAppealsDecisionResultDto.fromJson(
    Map<String, Object?> json,
  ) => _$AdminReviewAppealsDecisionResultDtoFromJson(json);

  final int decided;

  Map<String, Object?> toJson() =>
      _$AdminReviewAppealsDecisionResultDtoToJson(this);
}
