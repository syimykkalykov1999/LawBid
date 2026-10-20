import 'dart:async';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/app_update/app_update_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:url_launcher/url_launcher.dart';

const _kKey = 'web.openapp.v1';

/// Widest browser window that still counts as a phone.
const double kOpenInAppMaxWidth = 600;

/// The link that hands the page the visitor is on over to the phone app:
/// Android gets an intent link (opens the app, or the store page when the
/// app is missing), iOS gets the app's own `lawbid://` link. Null on other
/// platforms.
@visibleForTesting
Uri? openInAppUri({
  required TargetPlatform platform,
  required Uri page,
  required Uri? store,
}) {
  final path = page.path.startsWith('/') ? page.path.substring(1) : page.path;
  final query = page.hasQuery ? '?${page.query}' : '';
  switch (platform) {
    case TargetPlatform.android:
      final fallback = store == null
          ? ''
          : 'S.browser_fallback_url=${Uri.encodeComponent(store.toString())};';
      return Uri.parse(
        'intent://${page.host}/$path$query#Intent;scheme=https;'
        'package=com.lawbid.lawbid;$fallback'
        'end',
      );
    case TargetPlatform.iOS:
      return Uri.parse('lawbid://$path$query');
    case _:
      return null;
  }
}

/// Owner 2026-10-20 (web): on a phone-sized browser a slim strip above the
/// site, «Open the app», that opens the same page in the LawBid app (the
/// chat and the calls work best there). The close button hides it for good
/// in this browser. Phone apps and wide windows never show it.
class WebOpenInApp extends ConsumerStatefulWidget {
  const WebOpenInApp({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<WebOpenInApp> createState() => _WebOpenInAppState();
}

class _WebOpenInAppState extends ConsumerState<WebOpenInApp> {
  bool _closed = false;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return widget.child;
    final prefs = ref.watch(sharedPreferencesProvider);
    final platform = defaultTargetPlatform;
    final phone =
        platform == TargetPlatform.android || platform == TargetPlatform.iOS;
    final narrow = MediaQuery.sizeOf(context).width < kOpenInAppMaxWidth;
    if (!phone || !narrow || _closed || prefs.getString(_kKey) != null) {
      return widget.child;
    }
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final target = openInAppUri(
      platform: platform,
      page: Uri.base,
      store: ref.watch(storeUrlProvider),
    );
    return Column(
      children: [
        Material(
          key: const ValueKey('web-open-in-app'),
          color: colors.sheet,
          child: Padding(
            padding: const EdgeInsetsDirectional.only(
              start: AppSpacing.md,
              end: AppSpacing.xs,
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextButton(
                    key: const ValueKey('web-open-in-app-open'),
                    style: TextButton.styleFrom(
                      alignment: AlignmentDirectional.centerStart,
                    ),
                    onPressed: target == null
                        ? null
                        : () => unawaited(
                              launchUrl(
                                target,
                                mode: LaunchMode.externalApplication,
                              ).catchError((_) => false),
                            ),
                    child: Text(
                      t.t('qr.link.open'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(color: colors.goldAccent),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: t.t('common.close'),
                  icon: const Icon(Icons.close, size: 18),
                  onPressed: () {
                    unawaited(prefs.setString(_kKey, 'closed'));
                    setState(() => _closed = true);
                  },
                ),
              ],
            ),
          ),
        ),
        Expanded(child: widget.child),
      ],
    );
  }
}
