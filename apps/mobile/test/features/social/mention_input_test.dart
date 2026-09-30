import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/presentation/widgets/mention_suggestions.dart';

/// OQ-042: the "@…" being typed and its replacement.
TextEditingValue _v(String text, [int? cursor]) => TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: cursor ?? text.length),
    );

void main() {
  test('finds the @query right before the cursor', () {
    expect(mentionQueryAt(_v('Hi @si'))?.query, 'si');
    expect(mentionQueryAt(_v('@'))?.query, '');
    expect(mentionQueryAt(_v('mail a@b'))?.query, isNull);
    expect(mentionQueryAt(_v('Hi @sima done'))?.query, isNull);
    expect(mentionQueryAt(_v('Hi @gggg.gg'))?.query, 'gggg.gg');
  });

  test('inserts @username with a space and moves the cursor', () {
    final out = insertMention(_v('Thanks @si and more', 10), 'sima');
    expect(out.text, 'Thanks @sima  and more');
    expect(out.selection.baseOffset, 13);
  });
}
