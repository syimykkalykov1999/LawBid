import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/tools/template_form_logic.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

api.FormFieldDto _f(
  String key,
  api.FormFieldDtoType type, {
  bool required = false,
  api.FormFieldDtoPrefill? prefill,
}) =>
    api.FormFieldDto(
      key: key,
      type: type,
      requiredValue: required,
      label: {'en': key},
      prefill: prefill,
    );

void main() {
  test('required, number and date rules follow the server', () {
    final name = _f('name', api.FormFieldDtoType.text, required: true);
    expect(checkField(name, '  '), FieldProblem.required);
    expect(checkField(name, 'Ann'), isNull);
    final n = _f('n', api.FormFieldDtoType.number);
    expect(checkField(n, ''), isNull);
    expect(checkField(n, '12,5'), isNull);
    expect(checkField(n, '-3.20'), isNull);
    expect(checkField(n, '12a'), FieldProblem.invalid);
    final d = _f('d', api.FormFieldDtoType.date);
    expect(checkField(d, '2026-10-20'), isNull);
    expect(checkField(d, '20.10.2026'), FieldProblem.invalid);
    expect(
      checkField(_f('t', api.FormFieldDtoType.text), 'x' * 201),
      FieldProblem.tooLong,
    );
  });

  test('checkForm lists every bad field; cleanValues trims and drops empties',
      () {
    final fields = [
      _f('a', api.FormFieldDtoType.text, required: true),
      _f('b', api.FormFieldDtoType.number),
      _f('c', api.FormFieldDtoType.text),
    ];
    final values = {'a': '', 'b': 'x', 'c': ' hi '};
    expect(checkForm(fields, values), {
      'a': FieldProblem.required,
      'b': FieldProblem.invalid,
    });
    expect(cleanValues(fields, {'a': ' A ', 'b': '', 'c': ' hi '}), {
      'a': 'A',
      'c': 'hi',
    });
  });

  test('prefill comes from the case values, language falls back to English',
      () {
    final tpl = api.FormTemplateDto(
      id: 't1',
      slug: 's',
      title: const {'en': 'Power', 'ru': 'Доверенность'},
      description: const {},
      languages: const ['en', 'ru'],
      fields: [
        _f(
          'who',
          api.FormFieldDtoType.text,
          prefill: api.FormFieldDtoPrefill.clientName,
        ),
        _f(
          'when',
          api.FormFieldDtoType.date,
          prefill: api.FormFieldDtoPrefill.today,
        ),
        _f('free', api.FormFieldDtoType.text),
      ],
    );
    expect(
      initialValues(tpl, {'client_name': 'Ann', 'today': '2026-10-20'}),
      {'who': 'Ann', 'when': '2026-10-20'},
    );
    expect(pickText(tpl.title, 'ru'), 'Доверенность');
    expect(pickText(tpl.title, 'de'), 'Power');
    expect(pickLanguage(const ['en', 'ru'], 'ru'), 'ru');
    expect(pickLanguage(const ['en', 'ru'], 'de'), 'en');
    expect(pickLanguage(const ['ru'], 'de'), 'ru');
  });

  test('dates round-trip as yyyy-MM-dd', () {
    expect(isoDate(DateTime(2026, 3, 5)), '2026-03-05');
    expect(parseIsoDate('2026-03-05'), DateTime(2026, 3, 5));
    expect(parseIsoDate('5/3/2026'), isNull);
  });
}
