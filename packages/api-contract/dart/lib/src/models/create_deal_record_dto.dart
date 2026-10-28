// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_deal_record_dto.g.dart';

@JsonSerializable()
class CreateDealRecordDto {
  const CreateDealRecordDto({required this.bidId});

  factory CreateDealRecordDto.fromJson(Map<String, Object?> json) =>
      _$CreateDealRecordDtoFromJson(json);

  /// The bid being accepted.
  final String bidId;

  Map<String, Object?> toJson() => _$CreateDealRecordDtoToJson(this);
}
