// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'delivered_result_dto.g.dart';

@JsonSerializable()
class DeliveredResultDto {
  const DeliveredResultDto({required this.lastDeliveredMessageId});

  factory DeliveredResultDto.fromJson(Map<String, Object?> json) =>
      _$DeliveredResultDtoFromJson(json);

  final String? lastDeliveredMessageId;

  Map<String, Object?> toJson() => _$DeliveredResultDtoToJson(this);
}
