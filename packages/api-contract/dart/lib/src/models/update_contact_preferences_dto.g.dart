// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_contact_preferences_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateContactPreferencesDto _$UpdateContactPreferencesDtoFromJson(
  Map<String, dynamic> json,
) => UpdateContactPreferencesDto(
  contactMethod: json['contactMethod'] == null
      ? null
      : UpdateContactPreferencesDtoContactMethod.fromJson(
          json['contactMethod'] as String,
        ),
  contactNote: json['contactNote'] as String?,
);

Map<String, dynamic> _$UpdateContactPreferencesDtoToJson(
  UpdateContactPreferencesDto instance,
) => <String, dynamic>{
  'contactMethod': ?instance.contactMethod?.toJson(),
  'contactNote': ?instance.contactNote,
};
