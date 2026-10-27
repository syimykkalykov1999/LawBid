// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_decide_suggestion_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDecideSuggestionResultDto _$StaffDecideSuggestionResultDtoFromJson(
  Map<String, dynamic> json,
) => StaffDecideSuggestionResultDto(
  id: json['id'] as String,
  status: StaffDecideSuggestionResultDtoStatus.fromJson(
    json['status'] as String,
  ),
  done: json['done'] as String,
);

Map<String, dynamic> _$StaffDecideSuggestionResultDtoToJson(
  StaffDecideSuggestionResultDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'status': instance.status.toJson(),
  'done': instance.done,
};
