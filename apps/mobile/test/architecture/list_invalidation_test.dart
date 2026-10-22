import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-10-22 (client economy plan §4): a single-row action (a like,
/// a bid, a read, a mute …) answers with the row — it is applied to the
/// list that holds it. `ref.invalidate(<listProvider>)` after such an
/// action reloads a whole page for one changed row, so **no new one** may
/// be added. What remains is recorded in `list_invalidation_baseline.json`
/// with the reason it stays (a list the server sends no event or delta
/// for); the baseline may only shrink.
///
/// Refresh after removing some: `UPDATE_INVALIDATIONS=1 flutter test
/// test/architecture`.
void main() {
  final root = Directory('lib/features');
  final baselineFile =
      File('test/architecture/list_invalidation_baseline.json');

  // `ref.invalidate(xProvider)` / `..invalidate(xProvider(...))` of a list
  // provider: its name ends with a plural list noun or `List`, or it is one
  // of the paged providers below.
  final call = RegExp(r'\.\.?invalidate\(\s*([A-Za-z_][A-Za-z0-9_]*)');
  final listName = RegExp(
    r'^(?:[a-z][A-Za-z0-9]*?)(?:s|List|Feed|Page|Pages|Tray)Provider$',
  );
  final knownLists = {
    'commentsProvider',
    'repliesProvider',
    'caseFeedProvider',
    'feedProvider',
    'notificationsProvider',
    'questionsProvider',
    'conversationsProvider',
    'folderConversationsProvider',
    'groupsProvider',
    'archivedGroupsProvider',
    'channelListProvider',
    'consultationsListProvider',
  };
  // Not lists (counters, cards, settings) despite the plural look.
  final notLists = {
    'seenBidCountsProvider',
    'chatFolderCountsProvider',
    'messageRequestsCountProvider',
    'notificationSettingsProvider',
    'consultationSettingsProvider',
    'consultationSlotsProvider',
    'clientContactsProvider',
    'contactsSyncStatusProvider',
    'privacySettingsProvider',
    'storySettingsProvider',
    'postInsightsProvider',
    'attorneyStatsProvider',
    'promotionStatsProvider',
  };

  final found = <String>[];
  for (final f in root.listSync(recursive: true).whereType<File>()) {
    if (!f.path.endsWith('.dart') || f.path.endsWith('.g.dart')) continue;
    // The rule is about actions: the application layer (and the few
    // action files under presentation that end in `_actions.dart`).
    if (!f.path.contains('/application/') &&
        !f.path.endsWith('_actions.dart')) {
      continue;
    }
    final lines = f.readAsLinesSync();
    for (var i = 0; i < lines.length; i++) {
      // A Retry button or pull-to-refresh is the user asking for a reload.
      if (lines[i].contains('onRetry') || lines[i].contains('onRefresh')) {
        continue;
      }
      for (final m in call.allMatches(lines[i])) {
        final name = m.group(1)!;
        if (notLists.contains(name)) continue;
        if (!knownLists.contains(name) && !listName.hasMatch(name)) continue;
        found.add('${f.path.substring(4)}:$name');
      }
    }
  }
  final now = found.toSet().toList()..sort();

  if (Platform.environment['UPDATE_INVALIDATIONS'] == '1') {
    final old = baselineFile.existsSync()
        ? (jsonDecode(baselineFile.readAsStringSync())
            as Map<String, dynamic>)['entries'] as Map<String, dynamic>
        : <String, dynamic>{};
    baselineFile.writeAsStringSync(
      '${const JsonEncoder.withIndent(' ').convert({
            'why': 'file:provider → why this list is still reloaded whole',
            'entries': {
              for (final e in now) e: old[e] ?? 'TODO: reason',
            },
          })}\n',
    );
  }
  final base =
      jsonDecode(baselineFile.readAsStringSync()) as Map<String, dynamic>;
  final known = (base['entries'] as Map<String, dynamic>).keys.toSet();

  test('no new blanket invalidate of a list provider', () {
    expect(
      now.where((e) => !known.contains(e)),
      isEmpty,
      reason: 'apply the answered row to the list (or ask one updatedSince) '
          'instead of reloading it; see the baseline for the ones that '
          'remain and why',
    );
  });

  test('a removed invalidate leaves the baseline (it only shrinks)', () {
    final current = now.toSet();
    expect(known.where((e) => !current.contains(e)), isEmpty);
  });

  test('every remaining entry says why', () {
    final entries = base['entries'] as Map<String, dynamic>;
    expect(
      entries.entries.where((e) => '${e.value}'.startsWith('TODO')),
      isEmpty,
    );
  });
}
