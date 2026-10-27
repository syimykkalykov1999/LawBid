// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'done_lease_dto.g.dart';

@JsonSerializable()
class DoneLeaseDto {
  const DoneLeaseDto({this.outcome});

  factory DoneLeaseDto.fromJson(Map<String, Object?> json) =>
      _$DoneLeaseDtoFromJson(json);

  /// What the person decided (approve · reject · resolve · …), when the page sends it. Used to check a known-answer task; ignored otherwise.
  final String? outcome;

  Map<String, Object?> toJson() => _$DoneLeaseDtoToJson(this);
}
