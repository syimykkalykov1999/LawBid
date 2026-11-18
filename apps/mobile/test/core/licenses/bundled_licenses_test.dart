import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/licenses/bundled_licenses.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('fonts, copied code and native SDKs are in the licence list', () async {
    final entries = await bundledLicenses().toList();
    final names = {for (final e in entries) ...e.packages};

    expect(names, containsAll(bundledLicenseAssets.keys));
    expect(names, contains(startsWith('Mediabunny')));
    expect(names, contains(startsWith('flutter_callkit_incoming')));
    expect(names, contains(startsWith('Native iOS / Android SDKs')));
    expect(names, contains(startsWith('Fonts and pictures')));

    // Every entry carries its licence text, not an empty section.
    for (final e in entries) {
      final text = e.paragraphs.map((p) => p.text).join('\n');
      expect(text.trim(), isNotEmpty, reason: e.packages.join());
    }
    final native = entries.firstWhere(
      (e) => e.packages.first.startsWith('Native iOS'),
    );
    expect(
      native.paragraphs.map((p) => p.text).join('\n'),
      contains('Marcin Krzyzanowski'),
    );
  });
}
