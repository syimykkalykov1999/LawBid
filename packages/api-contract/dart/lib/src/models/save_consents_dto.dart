// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consent_item_dto.dart';

part 'save_consents_dto.g.dart';

@JsonSerializable()
class SaveConsentsDto {
  const SaveConsentsDto({required this.consents});

  factory SaveConsentsDto.fromJson(Map<String, Object?> json) =>
      _$SaveConsentsDtoFromJson(json);

  final List<ConsentItemDto> consents;

  Map<String, Object?> toJson() => _$SaveConsentsDtoToJson(this);
}
