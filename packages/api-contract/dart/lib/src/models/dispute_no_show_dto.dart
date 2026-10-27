// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'dispute_no_show_dto.g.dart';

@JsonSerializable()
class DisputeNoShowDto {
  const DisputeNoShowDto({this.reason});

  factory DisputeNoShowDto.fromJson(Map<String, Object?> json) =>
      _$DisputeNoShowDtoFromJson(json);

  final String? reason;

  Map<String, Object?> toJson() => _$DisputeNoShowDtoToJson(this);
}
