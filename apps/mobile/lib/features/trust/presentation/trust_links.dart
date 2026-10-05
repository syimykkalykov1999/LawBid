import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens the state bar registry in the browser so the client can compare
/// the name and bar number themselves; a snackbar when there is no link or
/// the system refused to open it.
Future<void> openRegistryLink(
  BuildContext context,
  Translator t,
  RegistryLink link,
) async {
  final raw = link.url;
  final uri = raw == null ? null : Uri.tryParse(raw);
  if (uri == null) {
    showAppSnackBar(
      context,
      t.t('trust.registry.noUrl', {'state': link.stateName}),
    );
    return;
  }
  var ok = false;
  try {
    ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } on Object {
    ok = false;
  }
  if (!ok && context.mounted) {
    showAppSnackBar(context, t.t('trust.registry.cantOpen'));
  }
}

/// «Проверить в реестре» rows — one per licensed state.
class RegistryLinksList extends StatelessWidget {
  const RegistryLinksList({required this.links, required this.t, super.key});

  final List<RegistryLink> links;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    if (links.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final l in links)
          AppListRow(
            key: ValueKey('trust-registry-${l.stateCode}'),
            icon: AppIcons.openInNewRounded,
            label: t.t('trust.registry.open'),
            subtitle: t.t('trust.registry.state', {'state': l.stateName}),
            flush: true,
            onTap: () => openRegistryLink(context, t, l),
          ),
      ],
    );
  }
}
