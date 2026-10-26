import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/auth/presentation/widgets/us_phone_input.dart';

void main() {
  final f = UsPhoneFormatter();
  TextEditingValue v(String t) => TextEditingValue(text: t);

  test('formats while typing', () {
    expect(f.formatEditUpdate(v(''), v('7739935153')).text, '(773) 993-5153');
  });

  test('backspace over the dash deletes the digit before it', () {
    expect(
      f.formatEditUpdate(v('(777) 739-'), v('(777) 739')).text,
      '(777) 73',
    );
  });

  test('backspace over ") " deletes the digit before it', () {
    expect(f.formatEditUpdate(v('(777) '), v('(777)')).text, '(77');
  });

  test('plain backspace of the last digit still works', () {
    expect(
      f.formatEditUpdate(v('(773) 993-5153'), v('(773) 993-515')).text,
      '(773) 993-515',
    );
  });
}
