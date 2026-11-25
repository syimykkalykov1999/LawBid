// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_offer_case_result_dto.g.dart';

@JsonSerializable()
class HotlineOfferCaseResultDto {
  const HotlineOfferCaseResultDto({required this.caseId, this.inviteId});

  factory HotlineOfferCaseResultDto.fromJson(Map<String, Object?> json) =>
      _$HotlineOfferCaseResultDtoFromJson(json);

  final String caseId;
  final String? inviteId;

  Map<String, Object?> toJson() => _$HotlineOfferCaseResultDtoToJson(this);
}
