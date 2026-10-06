import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/config/app_links.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/legal/application/legal_providers.dart';
import 'package:lawbid/features/legal/domain/legal_documents.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-02: "About LawBid" in Settings — a few lines about the
/// product, the version, and a styled way to the website.
class AboutScreen extends ConsumerWidget {
  const AboutScreen({super.key});

  Future<void> _openSite(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final uri = Uri.parse(kWebsiteUrl);
    var ok = false;
    try {
      ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Object {
      ok = false;
    }
    if (!ok && context.mounted) {
      showAppSnackBar(context, t.t('about.cantOpen'));
    }
  }

  /// The app's own title for a known document type, else the server's.
  String _docTitle(Translator t, LegalDocumentBrief d) {
    final own = t.t('legal.doc.${d.docType}');
    return own.startsWith('legal.doc.') ? d.title : own;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final host = Uri.parse(kWebsiteUrl).host;
    final legalDocs = ref.watch(legalDocumentListProvider).value ??
        const <LegalDocumentBrief>[];

    Widget point(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: colors.goldTint,
                  shape: BoxShape.circle,
                  border: Border.all(color: colors.goldStroke),
                ),
                child: AppIcon(icon, color: colors.goldDark, size: 18),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    text,
                    style: type.body.copyWith(color: colors.text, height: 1.4),
                  ),
                ),
              ),
            ],
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('about.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.lg,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          children: [
            AppEntrance(
              child: Column(
                children: [
                  const ScalesLogo(
                    size: 120,
                    animated: true,
                    runFor: Duration(seconds: 6),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    t.t('brand.name'),
                    style: type.titleLarge.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  FutureBuilder<String>(
                    future: AppVersion.load(),
                    builder: (_, snap) => Text(
                      t.t('about.version', {'version': snap.data ?? ''}),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    t.t('about.tagline'),
                    textAlign: TextAlign.center,
                    style: type.titleMedium.copyWith(
                      color: colors.goldDark,
                      fontFamily: type.body.fontFamily,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            AppEntrance(
              index: 1,
              child: Column(
                children: [
                  point(AppIcons.gavelRounded, t.t('about.point.cases')),
                  point(AppIcons.verifiedRounded, t.t('about.point.verified')),
                  point(
                    AppIcons.chatBubbleOutlineRounded,
                    t.t('about.point.chat'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppEntrance(
              index: 2,
              child: Semantics(
                button: true,
                label: '${t.t('about.website')}. $host',
                excludeSemantics: true,
                child: AppPressable(
                  onTap: () => _openSite(context, ref),
                  child: Container(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(AppRadii.card),
                      border: Border.all(color: colors.goldStroke),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: colors.goldTint,
                            shape: BoxShape.circle,
                          ),
                          child: AppIcon(
                            AppIcons.languageRounded,
                            color: colors.goldDark,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.lg),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                t.t('about.website'),
                                style: type.titleMedium.copyWith(
                                  color: colors.text,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                host,
                                overflow: TextOverflow.ellipsis,
                                style: type.bodySmall.copyWith(
                                  color: colors.goldDark,
                                ),
                              ),
                            ],
                          ),
                        ),
                        AppIcon(
                          AppIcons.arrowForwardRounded,
                          color: colors.goldDark,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            AppEntrance(
              index: 3,
              child: Column(
                children: [
                  // Owner 2026-10-05 (legal documents): every current
                  // document the owner published; the two fixed links
                  // stay while the list is loading or unavailable.
                  if (legalDocs.isEmpty) ...[
                    AppListRow(
                      icon: AppIcons.balanceRounded,
                      label: t.t('settings.legal'),
                      onTap: () => context.push(AppRoutes.legalDoc('terms')),
                    ),
                    AppListRow(
                      icon: AppIcons.shieldOutlined,
                      label: t.t('about.privacy'),
                      onTap: () => context.push(AppRoutes.legalDoc('privacy')),
                    ),
                  ] else
                    for (final d in legalDocs)
                      AppListRow(
                        key: ValueKey('about-doc-${d.docType}'),
                        icon: d.docType == 'privacy'
                            ? AppIcons.shieldOutlined
                            : AppIcons.balanceRounded,
                        label: _docTitle(t, d),
                        onTap: () =>
                            context.push(AppRoutes.legalDoc(d.docType)),
                      ),
                  // Owner 2026-10-05 (legal): the DMCA takedown form.
                  AppListRow(
                    key: const ValueKey('about-dmca'),
                    icon: AppIcons.policyOutlined,
                    label: t.t('about.dmca'),
                    onTap: () => context.push(AppRoutes.dmcaNotice),
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
