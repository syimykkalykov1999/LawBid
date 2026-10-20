import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/support/data/support_context.dart';
import 'package:lawbid/features/support/domain/support_models.dart';
import 'package:lawbid/features/support/presentation/support_attachment_widgets.dart';

/// Owner 2026-10-18 (OQ-055): files on support messages and the screen the
/// user came from.
void main() {
  test('originRoute skips the support screens and finds where the user was',
      () {
    const prefix = '/profile/settings/support';
    expect(
      originRoute(
        ['/home', '/profile/settings', prefix, '$prefix/new'],
        supportPrefix: prefix,
      ),
      '/profile/settings',
    );
    expect(originRoute([prefix, '$prefix/new'], supportPrefix: prefix), isNull);
    expect(originRoute(const [], supportPrefix: prefix), isNull);
  });

  testWidgets('a message shows a document as a row, no overflow when long',
      (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(
            body: SizedBox(
              width: 260,
              child: SupportMessageFiles(
                attachments: [
                  SupportAttachment(
                    fileId: 'f1',
                    name: 'a-very-long-name-of-the-lease-agreement-scan-final'
                        '-version-2026.pdf',
                    mime: 'application/pdf',
                    sizeBytes: 182000,
                    isImage: false,
                    isVideo: false,
                    url: 'https://files.example/f1',
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.textContaining('lease-agreement'), findsOneWidget);
    expect(find.text('178 KB'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
