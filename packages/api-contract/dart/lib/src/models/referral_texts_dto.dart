// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'referral_texts_dto.g.dart';

@JsonSerializable()
class ReferralTextsDto {
  const ReferralTextsDto({
    required this.title,
    required this.summary,
    required this.terms,
    required this.shareMessage,
  });

  factory ReferralTextsDto.fromJson(Map<String, Object?> json) =>
      _$ReferralTextsDtoFromJson(json);

  final String title;
  final String summary;

  /// Terms and conditions.
  final String terms;

  /// Share sheet text; {{code}} and {{url}} are filled in.
  final String shareMessage;

  Map<String, Object?> toJson() => _$ReferralTextsDtoToJson(this);
}
