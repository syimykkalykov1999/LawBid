import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/progressive_photo.dart';

void main() {
  testWidgets('shows the small copy at once while the sharp one loads',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: const SizedBox(
          width: 300,
          height: 300,
          child: ProgressivePhoto(
            fileId: 'f1',
            previewUrl: 'https://cdn.test/f1_320.jpg',
            url: 'https://cdn.test/f1_1080.jpg',
          ),
        ),
      ),
    );
    // First frame: the stand-in is already in the tree (not a grey box).
    expect(find.byKey(ProgressivePhoto.previewKey), findsOneWidget);
    final urls = tester
        .widgetList<CachedNetworkImage>(find.byType(CachedNetworkImage))
        .map((w) => w.imageUrl)
        .toList();
    expect(urls, contains('https://cdn.test/f1_320.jpg'));
    expect(urls, contains('https://cdn.test/f1_1080.jpg'));
  });
}
