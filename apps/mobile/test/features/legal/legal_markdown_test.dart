import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/legal/presentation/widgets/legal_markdown.dart';

/// Owner 2026-10-05 (legal documents): the Markdown the owner writes in the
/// admin is shown in the app — headings, lists, bold and links.
const _md = '''
# Terms of Service

*Draft prepared for review by a licensed US attorney; not legal advice.*

First line of a paragraph
continues here.

## 1. Accounts

- You must provide **accurate** information.
- See the [Privacy Policy](https://lawbid.dev/privacy).
  - A nested item.

Last paragraph.
''';

void main() {
  test('parses headings, paragraphs and nested lists', () {
    final b = parseLegalMarkdown(_md);
    expect(b.map((x) => x.kind).toList(),
        ['h', 'p', 'p', 'h', 'li', 'li', 'li', 'p'],);
    expect(b[0].level, 1);
    expect(b[2].text, 'First line of a paragraph continues here.');
    expect(b[3].level, 2);
    expect(b[6].level, 1);
  });

  test('strips inline markers', () {
    expect(
      stripInline('a **b** *c* [d](https://x.y)'),
      'a b c d',
    );
  });

  testWidgets('renders text, bullets and a link label without markers',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const Scaffold(
            body: SingleChildScrollView(child: LegalMarkdown(_md)),),
      ),
    );
    expect(find.text('Terms of Service'), findsOneWidget);
    expect(find.textContaining('accurate', findRichText: true), findsOneWidget);
    expect(find.textContaining('Privacy Policy', findRichText: true),
        findsOneWidget,);
    expect(find.textContaining('**', findRichText: true), findsNothing);
    expect(find.textContaining('](', findRichText: true), findsNothing);
    expect(find.text('• '), findsNWidgets(3));
  });
}
