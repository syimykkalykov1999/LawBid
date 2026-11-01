import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart';

import '../../helpers/long_locale.dart' show useNarrowPhone;
import '../../helpers/ux_harness.dart';

class _Seeded extends CreateCaseController {
  _Seeded(this.photos);

  final List<CasePhotoUpload> photos;

  @override
  CreateCaseState build() =>
      CreateCaseState(draft: const CaseDraft(), photos: photos);
}

UploadLimits _limits(int photos, int files) => UploadLimits({
      ...kDefaultUploadLimits,
      UploadPlace.kase: PlaceUploadLimits(
        maxPhotos: photos,
        maxFiles: files,
        fileMb: 10,
        totalMb: 50,
        formats: const {'jpeg', 'png', 'pdf'},
      ),
    });

void main() {
  const t = StaticTranslatorRu();

  Future<void> pump(
    WidgetTester tester,
    int photos,
    int files, {
    List<CasePhotoUpload> have = const [],
    double scale = 1,
  }) async {
    useNarrowPhone(tester);
    final overrides = <Override>[
      ...uxOverrides(translator: t),
      uploadLimitsProvider.overrideWithValue(_limits(photos, files)),
      createCaseControllerProvider.overrideWith(() => _Seeded(have)),
    ];
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          theme: AppTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(scale),
              disableAnimations: true,
            ),
            child: child!,
          ),
          home: const Scaffold(
            body: SingleChildScrollView(
              padding: EdgeInsets.all(16),
              child: CasePhotosPicker(),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  final photoBtn = find.text(t.t('cases.photos.tilePhoto'));
  final fileBtn = find.text(t.t('cases.photos.tileFile'));
  final caption = find.textContaining('До ');

  testWidgets('0 photos / 9 files: only the file button, no «До 0 фото»',
      (tester) async {
    await pump(tester, 0, 9);
    expect(photoBtn, findsNothing);
    expect(fileBtn, findsOneWidget);
    expect(find.textContaining('До 0'), findsNothing);
    expect(caption, findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('9 photos / 0 files: only the photo button', (tester) async {
    await pump(tester, 9, 0);
    expect(photoBtn, findsOneWidget);
    expect(fileBtn, findsNothing);
    expect(find.textContaining('до 0'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('9 / 9: both buttons and the full caption', (tester) async {
    await pump(tester, 9, 9);
    expect(photoBtn, findsOneWidget);
    expect(fileBtn, findsOneWidget);
    expect(caption, findsOneWidget);
  });

  testWidgets('0 / 0: no block at all', (tester) async {
    await pump(tester, 0, 0);
    expect(find.text(t.t('cases.photos.title')), findsNothing);
    expect(photoBtn, findsNothing);
    expect(fileBtn, findsNothing);
  });

  for (final scale in [1.0, 1.6]) {
    testWidgets('reached limit: caption below the button, wrapped, x$scale',
        (tester) async {
      await pump(
        tester,
        1,
        1,
        scale: scale,
        have: [
          CasePhotoUpload(key: 1, bytes: Uint8List(0), fileId: 'a'),
          CasePhotoUpload(
            key: 2,
            bytes: Uint8List(0),
            fileId: 'b',
            name: 'a.pdf',
          ),
        ],
      );
      expect(tester.takeException(), isNull);
      final limit = find.text(t.t('cases.photos.limitReached', {'max': '1'}));
      expect(limit, findsNWidgets(2));
      for (final b in [photoBtn, fileBtn]) {
        final btn = tester.getRect(b);
        // The caption sits under its button and never touches it.
        final under = limit.evaluate().map(
              (e) => tester.getRect(find.byWidget(e.widget)),
            );
        expect(
          under.any((r) => r.top >= btn.bottom && r.overlaps(btn) == false),
          isTrue,
        );
      }
    });
  }
}
