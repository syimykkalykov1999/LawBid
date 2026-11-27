import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/groups/application/group_photo_outbox.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show GoldRingAvatar;
import 'package:material_ui/material_ui.dart';

/// Owner 26.11 (WhatsApp / Telegram): a picked group photo shows at once,
/// stays (no flicker) once the group has it, and goes back to the old photo
/// when the server refuses it.
class _Avatar extends ConsumerWidget {
  const _Avatar(this.serverUrl);

  final String? serverUrl;

  @override
  Widget build(BuildContext context, WidgetRef ref) => GoldRingAvatar(
        url: serverUrl,
        preview: groupPhotoPreview(ref, 'g1', serverUrl),
        initials: 'G',
        size: 48,
      );
}

void main() {
  final jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);

  bool showsPicked(WidgetTester tester) =>
      tester.widget<AppAvatar>(find.byType(AppAvatar)).imageProvider
          is MemoryImage;

  Future<ProviderContainer> pump(WidgetTester tester, String? url) async {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(body: _Avatar(url)),
        ),
      ),
    );
    return c;
  }

  testWidgets('the picked photo shows at once and stays once it is set',
      (tester) async {
    final c = await pump(tester, 'https://cdn.test/old.jpg');
    expect(showsPicked(tester), isFalse);

    c.read(groupPhotoPreviewsProvider.notifier).show('g1', jpeg);
    await tester.pump();
    expect(showsPicked(tester), isTrue);

    // the server set it: the group now shows the new link — still the
    // local picture (the same image), nothing reloads
    c
        .read(groupPhotoPreviewsProvider.notifier)
        .settle('g1', 'https://cdn.test/new.jpg');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(body: _Avatar('https://cdn.test/new.jpg')),
        ),
      ),
    );
    expect(showsPicked(tester), isTrue);

    // someone changed it later: the server's photo wins
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const Scaffold(body: _Avatar('https://cdn.test/later.jpg')),
        ),
      ),
    );
    expect(showsPicked(tester), isFalse);
  });

  testWidgets('a refused photo goes back to the old one', (tester) async {
    final c = await pump(tester, 'https://cdn.test/old.jpg');
    c.read(groupPhotoPreviewsProvider.notifier).show('g1', jpeg);
    await tester.pump();
    expect(showsPicked(tester), isTrue);

    c.read(groupPhotoPreviewsProvider.notifier).drop('g1');
    await tester.pump();
    expect(showsPicked(tester), isFalse);
  });
}
