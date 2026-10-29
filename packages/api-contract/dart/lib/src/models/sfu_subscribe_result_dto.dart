// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_skipped_dto.dart';
import 'sfu_subscribe_result_dto_type.dart';
import 'sfu_subscription_dto.dart';

part 'sfu_subscribe_result_dto.g.dart';

@JsonSerializable()
class SfuSubscribeResultDto {
  const SfuSubscribeResultDto({
    required this.requiresAnswer,
    required this.type,
    required this.sdp,
    required this.subscriptions,
    required this.skipped,
  });
  
  factory SfuSubscribeResultDto.fromJson(Map<String, Object?> json) => _$SfuSubscribeResultDtoFromJson(json);
  
  /// true: apply `sdp` as the remote offer, answer it with POST /calls/:id/sfu/answer.
  final bool requiresAnswer;
  final SfuSubscribeResultDtoType? type;
  final String? sdp;
  final List<SfuSubscriptionDto> subscriptions;

  /// `batch_limit` entries: ask again after the answer has been sent.
  final List<SfuSkippedDto> skipped;

  Map<String, Object?> toJson() => _$SfuSubscribeResultDtoToJson(this);
}
