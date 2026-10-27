// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_open_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffOpenSuggestionDto _$StaffOpenSuggestionDtoFromJson(
  Map<String, dynamic> json,
) => StaffOpenSuggestionDto(
  id: json['id'] as String,
  kind: StaffSuggestionKind.fromJson(json['kind'] as String),
  createdAt: json['createdAt'] as String,
);

Map<String, dynamic> _$StaffOpenSuggestionDtoToJson(
  StaffOpenSuggestionDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind.toJson(),
  'createdAt': instance.createdAt,
};
