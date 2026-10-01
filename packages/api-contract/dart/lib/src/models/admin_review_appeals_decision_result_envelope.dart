// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_review_appeals_decision_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_review_appeals_decision_result_envelope.g.dart';

@JsonSerializable()
class AdminReviewAppealsDecisionResultEnvelope {
  const AdminReviewAppealsDecisionResultEnvelope({
    required this.data,
    this.meta,
  });

  factory AdminReviewAppealsDecisionResultEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminReviewAppealsDecisionResultEnvelopeFromJson(json);

  final AdminReviewAppealsDecisionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminReviewAppealsDecisionResultEnvelopeToJson(this);
}
