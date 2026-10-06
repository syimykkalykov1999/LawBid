import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';

/// Owner 2026-10-06: the whole News system (the News topic, the Post/News
/// switch, the profile News tab, the "News" label on cards) is switched
/// off for now — a post and a news item land in the same feed. The code
/// stays; the owner turns it back on in Admin → Система → Функции.
const kNewsFlag = 'news_posts';

final newsEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled(kNewsFlag),
);
