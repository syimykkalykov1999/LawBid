// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'extend_subscription_dto.g.dart';

@JsonSerializable()
class ExtendSubscriptionDto {
  const ExtendSubscriptionDto({required this.days, required this.reason});

  factory ExtendSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$ExtendSubscriptionDtoFromJson(json);

  final int days;

  /// Required (§1.6): e.g. the confirmed contact issue.
  final String reason;

  Map<String, Object?> toJson() => _$ExtendSubscriptionDtoToJson(this);
}
