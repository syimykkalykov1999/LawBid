// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bid_join_dto.g.dart';

@JsonSerializable()
class BidJoinDto {
  const BidJoinDto({required this.bidId});

  factory BidJoinDto.fromJson(Map<String, Object?> json) =>
      _$BidJoinDtoFromJson(json);

  final String bidId;

  Map<String, Object?> toJson() => _$BidJoinDtoToJson(this);
}
