// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'apply_referral_dto.g.dart';

@JsonSerializable()
class ApplyReferralDto {
  const ApplyReferralDto({required this.code});

  factory ApplyReferralDto.fromJson(Map<String, Object?> json) =>
      _$ApplyReferralDtoFromJson(json);

  /// 6–8 characters.
  final String code;

  Map<String, Object?> toJson() => _$ApplyReferralDtoToJson(this);
}
