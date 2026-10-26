// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'referral_count_dto.g.dart';

@JsonSerializable()
class ReferralCountDto {
  const ReferralCountDto({required this.key, required this.count});

  factory ReferralCountDto.fromJson(Map<String, Object?> json) =>
      _$ReferralCountDtoFromJson(json);

  final String key;
  final int count;

  Map<String, Object?> toJson() => _$ReferralCountDtoToJson(this);
}
