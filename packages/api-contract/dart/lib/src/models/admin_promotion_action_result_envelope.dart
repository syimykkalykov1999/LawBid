// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_promotion_action_result_dto.dart';
import 'response_meta_dto.dart';

part 'admin_promotion_action_result_envelope.g.dart';

@JsonSerializable()
class AdminPromotionActionResultEnvelope {
  const AdminPromotionActionResultEnvelope({required this.data, this.meta});

  factory AdminPromotionActionResultEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$AdminPromotionActionResultEnvelopeFromJson(json);

  final AdminPromotionActionResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$AdminPromotionActionResultEnvelopeToJson(this);
}
