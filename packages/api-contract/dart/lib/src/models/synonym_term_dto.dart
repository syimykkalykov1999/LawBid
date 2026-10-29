// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'synonym_term_dto.g.dart';

@JsonSerializable()
class SynonymTermDto {
  const SynonymTermDto({
    required this.lang,
    required this.term,
  });
  
  factory SynonymTermDto.fromJson(Map<String, Object?> json) => _$SynonymTermDtoFromJson(json);
  
  /// Language code of the phrase.
  final String lang;
  final String term;

  Map<String, Object?> toJson() => _$SynonymTermDtoToJson(this);
}
