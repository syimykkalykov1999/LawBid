import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

/// One place a link can go.
typedef _Target = ({
  String key,
  Widget icon,
  String label,
  Future<bool> Function() go,
});

/// Owner 2026-10-01: "Share" everywhere (posts, cases, profiles) opens one
/// LawBid sheet with the social networks — WhatsApp, Telegram, Instagram,
/// TikTok, Facebook, Messenger, X, LinkedIn, Viber, SMS, email — plus
/// "Copy link" and "More" (the system sheet). Returns true when the link
/// went somewhere (the caller counts the share), false when dismissed.
///
/// Networks without a link-share API (Instagram, TikTok) get the link
/// copied and their app opened, with a hint to paste it.
Future<bool> showShareSheet(
  BuildContext context, {
  required Translator t,
  required String link,
  String? text,
}) async {
  final message = text == null || text.isEmpty ? link : '$text\n$link';
  const enc = Uri.encodeComponent;
  final box = context.findRenderObject() as RenderBox?;
  final origin = box == null || !box.hasSize
      ? null
      : box.localToGlobal(Offset.zero) & box.size;

  Future<bool> open(String url, {String? fallback}) async {
    try {
      if (await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      )) {
        return true;
      }
    } on Object {
      // Not installed: try the web fallback below.
    }
    if (fallback == null) return false;
    try {
      return await launchUrl(
        Uri.parse(fallback),
        mode: LaunchMode.externalApplication,
      );
    } on Object {
      return false;
    }
  }

  Future<bool> copyAndOpen(String app, String web, String name) async {
    await Clipboard.setData(ClipboardData(text: message));
    if (context.mounted) {
      showAppSnackBar(context, t.t('share.pasteIn', {'app': name}));
    }
    await open(app, fallback: web);
    return true;
  }

  Widget brand(FaIconData icon, Color color) =>
      FaIcon(icon, size: 24, color: color);

  final targets = <_Target>[
    (
      key: 'whatsapp',
      icon: brand(FontAwesomeIcons.whatsapp, const Color(0xFF25D366)),
      label: 'WhatsApp',
      go: () => open(
            'whatsapp://send?text=${enc(message)}',
            fallback: 'https://wa.me/?text=${enc(message)}',
          ),
    ),
    (
      key: 'telegram',
      icon: brand(FontAwesomeIcons.telegram, const Color(0xFF29A9EB)),
      label: 'Telegram',
      go: () => open(
            'tg://msg_url?url=${enc(link)}&text=${enc(text ?? '')}',
            fallback:
                'https://t.me/share/url?url=${enc(link)}&text=${enc(text ?? '')}',
          ),
    ),
    (
      key: 'instagram',
      icon: brand(FontAwesomeIcons.instagram, const Color(0xFFE1306C)),
      label: 'Instagram',
      go: () => copyAndOpen(
            'instagram://direct-inbox',
            'https://www.instagram.com/direct/inbox/',
            'Instagram',
          ),
    ),
    (
      key: 'tiktok',
      icon: brand(FontAwesomeIcons.tiktok, const Color(0xFF111111)),
      label: 'TikTok',
      go: () =>
          copyAndOpen('snssdk1233://', 'https://www.tiktok.com/', 'TikTok'),
    ),
    (
      key: 'facebook',
      icon: brand(FontAwesomeIcons.facebook, const Color(0xFF1877F2)),
      label: 'Facebook',
      go: () =>
          open('https://www.facebook.com/sharer/sharer.php?u=${enc(link)}'),
    ),
    (
      key: 'messenger',
      icon: brand(FontAwesomeIcons.facebookMessenger, const Color(0xFF0084FF)),
      label: 'Messenger',
      go: () => open(
            'fb-messenger://share?link=${enc(link)}',
            fallback: 'https://www.messenger.com/',
          ),
    ),
    (
      key: 'x',
      icon: brand(FontAwesomeIcons.xTwitter, const Color(0xFF111111)),
      label: 'X',
      go: () => open(
            'https://twitter.com/intent/tweet?url=${enc(link)}&text=${enc(text ?? '')}',
          ),
    ),
    (
      key: 'linkedin',
      icon: brand(FontAwesomeIcons.linkedin, const Color(0xFF0A66C2)),
      label: 'LinkedIn',
      go: () => open(
            'https://www.linkedin.com/sharing/share-offsite/?url=${enc(link)}',
          ),
    ),
    (
      key: 'viber',
      icon: brand(FontAwesomeIcons.viber, const Color(0xFF7360F2)),
      label: 'Viber',
      go: () => open('viber://forward?text=${enc(message)}'),
    ),
    (
      key: 'sms',
      icon: brand(FontAwesomeIcons.commentSms, const Color(0xFF34C759)),
      label: t.t('share.sms'),
      go: () => open('sms:?body=${enc(message)}'),
    ),
    (
      key: 'email',
      icon: brand(FontAwesomeIcons.envelope, AppColorsLight.goldDark),
      label: t.t('share.email'),
      go: () => open(
            'mailto:?subject=${enc(text ?? 'LawBid')}&body=${enc(message)}',
          ),
    ),
  ];

  final picked = await showAppBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => _ShareSheet(t: t, link: link, targets: targets),
  );
  if (picked == null || !context.mounted) return false;
  switch (picked) {
    case 'copy':
      await Clipboard.setData(ClipboardData(text: link));
      if (context.mounted) showAppSnackBar(context, t.t('share.copied'));
      return true;
    case 'more':
      final r = await SharePlus.instance.share(
        ShareParams(
          uri: Uri.parse(link),
          sharePositionOrigin: origin,
        ),
      );
      return r.status != ShareResultStatus.dismissed;
  }
  final target = targets.firstWhere((x) => x.key == picked);
  final ok = await target.go();
  if (!ok && context.mounted) {
    showAppSnackBar(context, t.t('share.cantOpen', {'app': target.label}));
  }
  return ok;
}

class _ShareSheet extends StatelessWidget {
  const _ShareSheet({
    required this.t,
    required this.link,
    required this.targets,
  });

  final Translator t;
  final String link;
  final List<_Target> targets;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget tile(String key, Widget icon, String label) => SizedBox(
          width: 76,
          child: InkWell(
            key: ValueKey('share-$key'),
            borderRadius: BorderRadius.circular(AppRadii.card),
            onTap: () {
              HapticFeedback.selectionClick();
              Navigator.of(context).pop(key);
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: Column(
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      // A white disc keeps every logo legible in both
                      // themes; the ring is the brand's border colour.
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: colors.border),
                      boxShadow: [
                        BoxShadow(
                          color: colors.shadow,
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    alignment: Alignment.center,
                    child: icon,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: typography.caption.copyWith(color: colors.text),
                  ),
                ],
              ),
            ),
          ),
        );
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          0,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: AppSpacing.sm),
            const AppSheetHandle(),
            Text(
              t.t('share.title'),
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              runSpacing: AppSpacing.xs,
              children: [
                for (final x in targets) tile(x.key, x.icon, x.label),
                tile(
                  'more',
                  const AppIcon(
                    AppIcons.moreHorizRounded,
                    color: AppColorsLight.navy,
                  ),
                  t.t('share.more'),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            // The link itself with a copy button.
            Container(
              padding: const EdgeInsets.only(left: AppSpacing.md),
              decoration: BoxDecoration(
                color: colors.bg,
                borderRadius: BorderRadius.circular(AppRadii.field),
                border: Border.all(color: colors.border),
              ),
              child: Row(
                children: [
                  AppIcon(
                    AppIcons.linkRounded,
                    size: 18,
                    color: colors.goldDark,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      link,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.bodySmall
                          .copyWith(color: colors.textSecondary),
                    ),
                  ),
                  TextButton(
                    key: const ValueKey('share-copy'),
                    onPressed: () => Navigator.of(context).pop('copy'),
                    child: Text(
                      t.t('share.copy'),
                      style: TextStyle(
                        color: colors.goldDark,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
