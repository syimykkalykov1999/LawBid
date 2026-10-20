import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: pure rules of the "document from a template" form.
/// They mirror the server's checks (form-template.logic.ts), so a mistake
/// is shown at the field before the request is sent.
enum FieldProblem { required, invalid, tooLong }

int fieldMaxLength(api.FormFieldDtoType type) => switch (type) {
      api.FormFieldDtoType.textarea => 2000,
      api.FormFieldDtoType.date => 10,
      api.FormFieldDtoType.number => 30,
      _ => 200,
    };

final _dateRe = RegExp(r'^\d{4}-\d{2}-\d{2}$');
final _numberRe = RegExp(r'^-?\d+([.,]\d+)?$');

/// What is wrong with [raw] as the answer to [field] (null: nothing).
FieldProblem? checkField(api.FormFieldDto field, String raw) {
  final v = raw.trim();
  if (v.isEmpty) return field.requiredValue ? FieldProblem.required : null;
  if (v.length > fieldMaxLength(field.type)) return FieldProblem.tooLong;
  if (field.type == api.FormFieldDtoType.date && !_dateRe.hasMatch(v)) {
    return FieldProblem.invalid;
  }
  if (field.type == api.FormFieldDtoType.number && !_numberRe.hasMatch(v)) {
    return FieldProblem.invalid;
  }
  return null;
}

/// The problems of the whole form, by field key (empty: ready to build).
Map<String, FieldProblem> checkForm(
  List<api.FormFieldDto> fields,
  Map<String, String> values,
) =>
    {
      for (final f in fields)
        if (checkField(f, values[f.key] ?? '') case final p?) f.key: p,
    };

/// The answers to send: trimmed, empty ones left out.
Map<String, String> cleanValues(
  List<api.FormFieldDto> fields,
  Map<String, String> values,
) =>
    {
      for (final f in fields)
        if ((values[f.key] ?? '').trim().isNotEmpty)
          f.key: (values[f.key] ?? '').trim(),
    };

/// The starting answers: what the server prefills from the case.
Map<String, String> initialValues(
  api.FormTemplateDto template,
  Map<String, String> prefill,
) =>
    {
      for (final f in template.fields)
        if (f.prefill?.json case final key? when (prefill[key] ?? '') != '')
          f.key: prefill[key]!,
    };

/// A text of a template in [lang], else English, else any.
String pickText(Map<String, String> texts, String lang) {
  final exact = texts[lang];
  if (exact != null && exact.trim().isNotEmpty) return exact;
  final en = texts['en'];
  if (en != null && en.trim().isNotEmpty) return en;
  for (final v in texts.values) {
    if (v.trim().isNotEmpty) return v;
  }
  return '';
}

/// The document language: the app's when the template has it, else English,
/// else its first.
String pickLanguage(List<String> languages, String preferred) {
  if (languages.contains(preferred)) return preferred;
  if (languages.contains('en')) return 'en';
  return languages.isEmpty ? 'en' : languages.first;
}

/// A calendar date as the server wants it: `2026-10-20`.
String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

DateTime? parseIsoDate(String v) {
  if (!_dateRe.hasMatch(v)) return null;
  return DateTime.tryParse(v);
}
