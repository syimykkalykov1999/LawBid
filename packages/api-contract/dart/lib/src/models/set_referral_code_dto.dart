// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_referral_code_dto.g.dart';

@JsonSerializable()
class SetReferralCodeDto {
  const SetReferralCodeDto({
    required this.userId,
    required this.code,
    required this.reason,
  });

  factory SetReferralCodeDto.fromJson(Map<String, Object?> json) =>
      _$SetReferralCodeDtoFromJson(json);

  final String userId;

  /// Your own word: 4-24 letters or digits (case does not matter).
  final String code;
  final String reason;

  Map<String, Object?> toJson() => _$SetReferralCodeDtoToJson(this);
}
