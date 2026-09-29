// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_feed_item_dto.dart';

part 'saved_case_item_dto.g.dart';

@JsonSerializable()
class SavedCaseItemDto {
  const SavedCaseItemDto({
    required this.caseId,
    required this.savedAt,
    required this.available,
    this.title,
    this.caseValue,
  });

  factory SavedCaseItemDto.fromJson(Map<String, Object?> json) =>
      _$SavedCaseItemDtoFromJson(json);

  final String caseId;
  final String savedAt;

  /// false → "Кейс недоступен" (closed or no longer visible).
  final bool available;
  final String? title;

  /// The name has been replaced because it contains a keyword. Original name: `case`.
  /// The name has been replaced because it contains a keyword. Original name: `case`.
  /// The name has been replaced because it contains a keyword. Original name: `case`.
  @JsonKey(name: 'case')
  final CaseFeedItemDto? caseValue;

  Map<String, Object?> toJson() => _$SavedCaseItemDtoToJson(this);
}
