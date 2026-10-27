// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_data_request_intake_dto.g.dart';

@JsonSerializable()
class UpdateDataRequestIntakeDto {
  const UpdateDataRequestIntakeDto({
    this.legalBasis,
    this.dueAt,
    this.subjectUserId,
    this.doNotNotify,
    this.nondisclosureUntil,
  });

  factory UpdateDataRequestIntakeDto.fromJson(Map<String, Object?> json) =>
      _$UpdateDataRequestIntakeDtoFromJson(json);

  final String? legalBasis;
  final DateTime? dueAt;
  final String? subjectUserId;
  final bool? doNotNotify;
  final DateTime? nondisclosureUntil;

  Map<String, Object?> toJson() => _$UpdateDataRequestIntakeDtoToJson(this);
}
