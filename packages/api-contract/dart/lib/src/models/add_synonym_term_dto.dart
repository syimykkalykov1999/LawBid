// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_synonym_term_dto.g.dart';

@JsonSerializable()
class AddSynonymTermDto {
  const AddSynonymTermDto({required this.lang, required this.term});

  factory AddSynonymTermDto.fromJson(Map<String, Object?> json) =>
      _$AddSynonymTermDtoFromJson(json);

  /// Language code of the phrase.
  final String lang;
  final String term;

  Map<String, Object?> toJson() => _$AddSynonymTermDtoToJson(this);
}
