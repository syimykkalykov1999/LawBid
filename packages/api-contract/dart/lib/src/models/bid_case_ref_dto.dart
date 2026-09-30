// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_status.dart';

part 'bid_case_ref_dto.g.dart';

@JsonSerializable()
class BidCaseRefDto {
  const BidCaseRefDto({
    required this.id,
    required this.title,
    required this.status,
    required this.primaryStateCode,
    required this.practiceAreaNameEn,
    required this.practiceAreaI18nKey,
    required this.practiceAreaCode,
  });

  factory BidCaseRefDto.fromJson(Map<String, Object?> json) =>
      _$BidCaseRefDtoFromJson(json);

  final String id;
  final String title;
  final CaseStatus status;
  final String primaryStateCode;
  final String practiceAreaNameEn;
  final String practiceAreaI18nKey;

  /// Leaf practice code — picks the card art.
  final String practiceAreaCode;

  Map<String, Object?> toJson() => _$BidCaseRefDtoToJson(this);
}
