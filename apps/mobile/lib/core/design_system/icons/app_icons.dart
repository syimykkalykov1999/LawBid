import 'package:flutter/widgets.dart';

/// Owner 2026-10-01: every glyph is a Phosphor **Light** icon (MIT, fonts
/// in assets/fonts) — very light lines, premium minimalism (style 4 of the
/// comparison sheet). Active states (liked, saved, rated, verified,
/// playing, the selected tab) use the solid weight. Names keep the old
/// Material names so call sites read the same.
abstract final class AppIcons {
  static const lightFamily = 'PhosphorLight';
  static const fillFamily = 'PhosphorFill';

  static const IconData accountBalanceOutlined =
      IconData(0xe0b4, fontFamily: lightFamily);
  static const IconData accountBalanceWalletRounded =
      IconData(0xe68a, fontFamily: lightFamily);
  static const IconData addAPhotoOutlined =
      IconData(0xec58, fontFamily: lightFamily);
  static const IconData addCall =
      IconData(0xec56, fontFamily: lightFamily);
  static const IconData addLocationAltOutlined =
      IconData(0xe314, fontFamily: lightFamily);
  static const IconData addPhotoAlternateOutlined =
      IconData(0xe2cc, fontFamily: lightFamily);
  static const IconData addRounded =
      IconData(0xe3d4, fontFamily: lightFamily);
  static const IconData adminPanelSettingsOutlined =
      IconData(0xe4cc, fontFamily: lightFamily);
  static const IconData alternateEmailRounded =
      IconData(0xe0ac, fontFamily: lightFamily);
  static const IconData apartmentRounded =
      IconData(0xe102, fontFamily: lightFamily);
  static const IconData arrowDownwardRounded =
      IconData(0xe03e, fontFamily: lightFamily);
  static const IconData arrowForwardRounded =
      IconData(0xe06c, fontFamily: lightFamily);
  static const IconData arrowUpwardRounded =
      IconData(0xe08e, fontFamily: lightFamily);
  static const IconData article =
      IconData(0xe0a8, fontFamily: lightFamily);
  static const IconData articleOutlined =
      IconData(0xe0a8, fontFamily: lightFamily);
  static const IconData articleRounded =
      IconData(0xe0a8, fontFamily: lightFamily);
  static const IconData attachFileRounded =
      IconData(0xe39a, fontFamily: lightFamily);
  static const IconData autoAwesomeOutlined =
      IconData(0xe6a2, fontFamily: lightFamily);
  static const IconData autoModeRounded =
      IconData(0xe094, fontFamily: lightFamily);
  static const IconData badgeOutlined =
      IconData(0xe6f6, fontFamily: lightFamily);
  static const IconData balanceRounded =
      IconData(0xe750, fontFamily: lightFamily);
  static const IconData blockFlipped =
      IconData(0xe3de, fontFamily: lightFamily);
  static const IconData blockRounded =
      IconData(0xe3de, fontFamily: lightFamily);
  static const IconData bookmarkBorderRounded =
      IconData(0xe0ea, fontFamily: lightFamily);
  static const IconData bookmarkOutlineRounded =
      IconData(0xe0ea, fontFamily: lightFamily);
  static const IconData bookmarkRemoveOutlined =
      IconData(0xe0ea, fontFamily: lightFamily);
  static const IconData bookmarkRounded =
      IconData(0xe0ea, fontFamily: fillFamily);
  static const IconData businessCenterRounded =
      IconData(0xe0ee, fontFamily: lightFamily);
  static const IconData call =
      IconData(0xe3b8, fontFamily: lightFamily);
  static const IconData callEndRounded =
      IconData(0xe3bc, fontFamily: fillFamily);
  static const IconData callMadeRounded =
      IconData(0xe3c0, fontFamily: lightFamily);
  static const IconData callMissedRounded =
      IconData(0xe3c4, fontFamily: lightFamily);
  static const IconData callOutlined =
      IconData(0xe3b8, fontFamily: lightFamily);
  static const IconData callReceivedRounded =
      IconData(0xe3be, fontFamily: lightFamily);
  static const IconData callRounded =
      IconData(0xe3b8, fontFamily: lightFamily);
  static const IconData campaignOutlined =
      IconData(0xe324, fontFamily: lightFamily);
  static const IconData campaignRounded =
      IconData(0xe324, fontFamily: lightFamily);
  static const IconData cancelOutlined =
      IconData(0xe4f8, fontFamily: lightFamily);
  static const IconData cancelRounded =
      IconData(0xe4f8, fontFamily: fillFamily);
  static const IconData chatBubbleOutlineRounded =
      IconData(0xe168, fontFamily: lightFamily);
  static const IconData chatBubbleRounded =
      IconData(0xe168, fontFamily: fillFamily);
  static const IconData check =
      IconData(0xe182, fontFamily: lightFamily);
  static const IconData checkCircleOutlineRounded =
      IconData(0xe184, fontFamily: lightFamily);
  static const IconData checkCircleRounded =
      IconData(0xe184, fontFamily: fillFamily);
  static const IconData checkRounded =
      IconData(0xe182, fontFamily: lightFamily);
  static const IconData chevronRightRounded =
      IconData(0xe13a, fontFamily: lightFamily);
  static const IconData closeRounded =
      IconData(0xe4f6, fontFamily: lightFamily);
  static const IconData cloudUploadOutlined =
      IconData(0xe1ae, fontFamily: lightFamily);
  static const IconData collectionsRounded =
      IconData(0xe836, fontFamily: lightFamily);
  static const IconData computer =
      IconData(0xe560, fontFamily: lightFamily);
  static const IconData computerRounded =
      IconData(0xe560, fontFamily: lightFamily);
  static const IconData constructionRounded =
      IconData(0xed46, fontFamily: lightFamily);
  static const IconData contactPhoneOutlined =
      IconData(0xe6f8, fontFamily: lightFamily);
  static const IconData contrastRounded =
      IconData(0xe18c, fontFamily: lightFamily);
  static const IconData creditCardRounded =
      IconData(0xe1d2, fontFamily: lightFamily);
  static const IconData darkModeOutlined =
      IconData(0xe330, fontFamily: lightFamily);
  static const IconData deleteForeverRounded =
      IconData(0xe4a6, fontFamily: lightFamily);
  static const IconData deleteOutlineRounded =
      IconData(0xe4a6, fontFamily: lightFamily);
  static const IconData descriptionOutlined =
      IconData(0xe23a, fontFamily: lightFamily);
  static const IconData descriptionRounded =
      IconData(0xe23a, fontFamily: lightFamily);
  static const IconData devicesOther =
      IconData(0xeba4, fontFamily: lightFamily);
  static const IconData devicesRounded =
      IconData(0xeba4, fontFamily: lightFamily);
  static const IconData diamondOutlined =
      IconData(0xe1ec, fontFamily: lightFamily);
  static const IconData directionsCarFilledRounded =
      IconData(0xe112, fontFamily: lightFamily);
  static const IconData directionsCarOutlined =
      IconData(0xe112, fontFamily: lightFamily);
  static const IconData diversity3Rounded =
      IconData(0xe68e, fontFamily: lightFamily);
  static const IconData doNotDisturbOnOutlined =
      IconData(0xe32c, fontFamily: lightFamily);
  static const IconData doneAllRounded =
      IconData(0xe53a, fontFamily: lightFamily);
  static const IconData doneRounded =
      IconData(0xe182, fontFamily: lightFamily);
  static const IconData downloadRounded =
      IconData(0xe20c, fontFamily: lightFamily);
  static const IconData dragIndicatorRounded =
      IconData(0xeae2, fontFamily: lightFamily);
  static const IconData drawOutlined =
      IconData(0xe3b2, fontFamily: lightFamily);
  static const IconData dynamicFeedRounded =
      IconData(0xe466, fontFamily: lightFamily);
  static const IconData ecoRounded =
      IconData(0xe2da, fontFamily: lightFamily);
  static const IconData editNoteRounded =
      IconData(0xe34c, fontFamily: lightFamily);
  static const IconData editOutlined =
      IconData(0xe3b4, fontFamily: lightFamily);
  static const IconData elderlyRounded =
      IconData(0xe73a, fontFamily: lightFamily);
  static const IconData engineeringRounded =
      IconData(0xed46, fontFamily: lightFamily);
  static const IconData errorOutlineRounded =
      IconData(0xe4e2, fontFamily: lightFamily);
  static const IconData eventAvailableOutlined =
      IconData(0xe712, fontFamily: lightFamily);
  static const IconData eventAvailableRounded =
      IconData(0xe712, fontFamily: lightFamily);
  static const IconData eventNoteOutlined =
      IconData(0xe7b4, fontFamily: lightFamily);
  static const IconData eventNoteRounded =
      IconData(0xe7b4, fontFamily: lightFamily);
  static const IconData eventOutlined =
      IconData(0xe10a, fontFamily: lightFamily);
  static const IconData eventRepeatRounded =
      IconData(0xe714, fontFamily: lightFamily);
  static const IconData expandMoreRounded =
      IconData(0xe136, fontFamily: lightFamily);
  static const IconData faceOutlined =
      IconData(0xe436, fontFamily: lightFamily);
  static const IconData faceRetouchingNaturalOutlined =
      IconData(0xe6fc, fontFamily: lightFamily);
  static const IconData factCheckOutlined =
      IconData(0xeadc, fontFamily: lightFamily);
  static const IconData factCheckRounded =
      IconData(0xeadc, fontFamily: lightFamily);
  static const IconData familyRestroomRounded =
      IconData(0xe68e, fontFamily: lightFamily);
  static const IconData favoriteBorderRounded =
      IconData(0xe2a8, fontFamily: lightFamily);
  static const IconData favoriteRounded =
      IconData(0xe2a8, fontFamily: fillFamily);
  static const IconData filterAltOffOutlined =
      IconData(0xe26c, fontFamily: lightFamily);
  static const IconData fingerprint =
      IconData(0xe23e, fontFamily: lightFamily);
  static const IconData flagOutlined =
      IconData(0xe244, fontFamily: lightFamily);
  static const IconData flightTakeoffRounded =
      IconData(0xe504, fontFamily: lightFamily);
  static const IconData flipOutlined =
      IconData(0xed6a, fontFamily: lightFamily);
  static const IconData folder =
      IconData(0xe24a, fontFamily: lightFamily);
  static const IconData folderOpenRounded =
      IconData(0xe256, fontFamily: lightFamily);
  static const IconData folderOutlined =
      IconData(0xe24a, fontFamily: lightFamily);
  static const IconData folderRounded =
      IconData(0xe24a, fontFamily: lightFamily);
  static const IconData folderZipOutlined =
      IconData(0xe958, fontFamily: lightFamily);
  static const IconData formatQuoteRounded =
      IconData(0xe660, fontFamily: lightFamily);
  static const IconData forumOutlined =
      IconData(0xe17e, fontFamily: lightFamily);
  static const IconData gavel =
      IconData(0xea32, fontFamily: lightFamily);
  static const IconData gavelOutlined =
      IconData(0xea32, fontFamily: lightFamily);
  static const IconData gavelRounded =
      IconData(0xea32, fontFamily: lightFamily);
  static const IconData gppBadOutlined =
      IconData(0xe412, fontFamily: lightFamily);
  static const IconData gridOnRounded =
      IconData(0xe464, fontFamily: lightFamily);
  static const IconData gridViewRounded =
      IconData(0xe464, fontFamily: lightFamily);
  static const IconData groups2Outlined =
      IconData(0xe68e, fontFamily: lightFamily);
  static const IconData groups2Rounded =
      IconData(0xe68e, fontFamily: lightFamily);
  static const IconData groupsOutlined =
      IconData(0xe68e, fontFamily: lightFamily);
  static const IconData handshakeOutlined =
      IconData(0xe582, fontFamily: lightFamily);
  static const IconData healthAndSafetyRounded =
      IconData(0xe570, fontFamily: lightFamily);
  static const IconData helpOutlineRounded =
      IconData(0xe3e8, fontFamily: lightFamily);
  static const IconData hideSourceRounded =
      IconData(0xe224, fontFamily: lightFamily);
  static const IconData historyEduRounded =
      IconData(0xeb7a, fontFamily: lightFamily);
  static const IconData historyRounded =
      IconData(0xe1a0, fontFamily: lightFamily);
  static const IconData homeOutlined =
      IconData(0xe2c2, fontFamily: lightFamily);
  static const IconData homeRounded =
      IconData(0xe2c2, fontFamily: fillFamily);
  static const IconData homeWorkRounded =
      IconData(0xe2c4, fontFamily: lightFamily);
  static const IconData hourglassEmptyRounded =
      IconData(0xe2b2, fontFamily: lightFamily);
  static const IconData hourglassTopRounded =
      IconData(0xe2b4, fontFamily: lightFamily);
  static const IconData imageNotSupportedOutlined =
      IconData(0xe7a8, fontFamily: lightFamily);
  static const IconData imageOutlined =
      IconData(0xe2ca, fontFamily: lightFamily);
  static const IconData inboxOutlined =
      IconData(0xe4aa, fontFamily: lightFamily);
  static const IconData infoOutlineRounded =
      IconData(0xe2ce, fontFamily: lightFamily);
  static const IconData insertDriveFileRounded =
      IconData(0xe230, fontFamily: lightFamily);
  static const IconData insightsOutlined =
      IconData(0xe156, fontFamily: lightFamily);
  static const IconData inventory2Outlined =
      IconData(0xe00c, fontFamily: lightFamily);
  static const IconData iosShareRounded =
      IconData(0xeaf0, fontFamily: lightFamily);
  static const IconData keyOffRounded =
      IconData(0xe2d6, fontFamily: lightFamily);
  static const IconData language =
      IconData(0xe288, fontFamily: lightFamily);
  static const IconData languageRounded =
      IconData(0xe288, fontFamily: lightFamily);
  static const IconData lightModeOutlined =
      IconData(0xe472, fontFamily: lightFamily);
  static const IconData lightbulbRounded =
      IconData(0xe2dc, fontFamily: lightFamily);
  static const IconData linkOffRounded =
      IconData(0xe2e4, fontFamily: lightFamily);
  static const IconData linkRounded =
      IconData(0xe2e2, fontFamily: lightFamily);
  static const IconData localOfferOutlined =
      IconData(0xe478, fontFamily: lightFamily);
  static const IconData localPoliceRounded =
      IconData(0xec4a, fontFamily: lightFamily);
  static const IconData locationOnOutlined =
      IconData(0xe316, fontFamily: lightFamily);
  static const IconData lockOpenRounded =
      IconData(0xe306, fontFamily: lightFamily);
  static const IconData lockOutlineRounded =
      IconData(0xe2fa, fontFamily: lightFamily);
  static const IconData lockPersonOutlined =
      IconData(0xe2fe, fontFamily: lightFamily);
  static const IconData loginRounded =
      IconData(0xe428, fontFamily: lightFamily);
  static const IconData logoutRounded =
      IconData(0xe42a, fontFamily: lightFamily);
  static const IconData mailOutlineRounded =
      IconData(0xe218, fontFamily: lightFamily);
  static const IconData manageAccountsOutlined =
      IconData(0xe4cc, fontFamily: lightFamily);
  static const IconData mapOutlined =
      IconData(0xe31a, fontFamily: lightFamily);
  static const IconData markEmailReadOutlined =
      IconData(0xe216, fontFamily: lightFamily);
  static const IconData markEmailUnreadOutlined =
      IconData(0xe218, fontFamily: lightFamily);
  static const IconData medicalServicesRounded =
      IconData(0xe56e, fontFamily: lightFamily);
  static const IconData menuBookOutlined =
      IconData(0xe0e6, fontFamily: lightFamily);
  static const IconData micOffRounded =
      IconData(0xe328, fontFamily: lightFamily);
  static const IconData micRounded =
      IconData(0xe326, fontFamily: fillFamily);
  static const IconData militaryTechRounded =
      IconData(0xe320, fontFamily: lightFamily);
  static const IconData modeCommentOutlined =
      IconData(0xe172, fontFamily: lightFamily);
  static const IconData modeCommentRounded =
      IconData(0xe172, fontFamily: fillFamily);
  static const IconData moreHorizRounded =
      IconData(0xe1fe, fontFamily: lightFamily);
  static const IconData moreVertRounded =
      IconData(0xe208, fontFamily: lightFamily);
  static const IconData newspaperRounded =
      IconData(0xe344, fontFamily: lightFamily);
  static const IconData nightlightRound =
      IconData(0xe330, fontFamily: lightFamily);
  static const IconData noPhotographyOutlined =
      IconData(0xe110, fontFamily: lightFamily);
  static const IconData noteAddOutlined =
      IconData(0xe236, fontFamily: lightFamily);
  static const IconData notesRounded =
      IconData(0xe484, fontFamily: lightFamily);
  static const IconData notificationsActiveOutlined =
      IconData(0xe5e8, fontFamily: lightFamily);
  static const IconData notificationsNoneRounded =
      IconData(0xe0ce, fontFamily: lightFamily);
  static const IconData notificationsOffOutlined =
      IconData(0xe0d4, fontFamily: lightFamily);
  static const IconData notificationsRounded =
      IconData(0xe0ce, fontFamily: fillFamily);
  static const IconData openInNewRounded =
      IconData(0xe5de, fontFamily: lightFamily);
  static const IconData pauseCircleOutlineRounded =
      IconData(0xe3a0, fontFamily: lightFamily);
  static const IconData pauseRounded =
      IconData(0xe39e, fontFamily: fillFamily);
  static const IconData paymentsOutlined =
      IconData(0xe588, fontFamily: lightFamily);
  static const IconData peopleOutlineRounded =
      IconData(0xe4d6, fontFamily: lightFamily);
  static const IconData person =
      IconData(0xe4c2, fontFamily: lightFamily);
  static const IconData personAddAlt1Rounded =
      IconData(0xe4d0, fontFamily: lightFamily);
  static const IconData personOffOutlined =
      IconData(0xe4ce, fontFamily: lightFamily);
  static const IconData personOutline =
      IconData(0xe4c2, fontFamily: lightFamily);
  static const IconData personOutlineRounded =
      IconData(0xe4c2, fontFamily: lightFamily);
  static const IconData personRounded =
      IconData(0xe4c2, fontFamily: fillFamily);
  static const IconData personalInjuryRounded =
      IconData(0xe0b2, fontFamily: lightFamily);
  static const IconData petsRounded =
      IconData(0xe648, fontFamily: lightFamily);
  static const IconData phoneAndroid =
      IconData(0xe1e0, fontFamily: lightFamily);
  static const IconData phoneDisabledOutlined =
      IconData(0xe3c2, fontFamily: lightFamily);
  static const IconData phoneIphone =
      IconData(0xe1e0, fontFamily: lightFamily);
  static const IconData phoneIphoneRounded =
      IconData(0xe1e0, fontFamily: lightFamily);
  static const IconData phoneMissedRounded =
      IconData(0xe3c4, fontFamily: lightFamily);
  static const IconData phoneOutlined =
      IconData(0xe3b8, fontFamily: lightFamily);
  static const IconData phonelinkLockRounded =
      IconData(0xe1e2, fontFamily: lightFamily);
  static const IconData photoCameraFrontOutlined =
      IconData(0xe6fc, fontFamily: lightFamily);
  static const IconData photoCameraOutlined =
      IconData(0xe10e, fontFamily: lightFamily);
  static const IconData photoLibraryOutlined =
      IconData(0xe836, fontFamily: lightFamily);
  static const IconData pictureAsPdfOutlined =
      IconData(0xe702, fontFamily: lightFamily);
  static const IconData pictureAsPdfRounded =
      IconData(0xe702, fontFamily: lightFamily);
  static const IconData placeOutlined =
      IconData(0xe316, fontFamily: lightFamily);
  static const IconData plagiarismOutlined =
      IconData(0xe238, fontFamily: lightFamily);
  static const IconData playArrowRounded =
      IconData(0xe3d0, fontFamily: fillFamily);
  static const IconData policyOutlined =
      IconData(0xe40c, fontFamily: lightFamily);
  static const IconData policyRounded =
      IconData(0xe40c, fontFamily: lightFamily);
  static const IconData printOutlined =
      IconData(0xe3dc, fontFamily: lightFamily);
  static const IconData privacyTipOutlined =
      IconData(0xe412, fontFamily: lightFamily);
  static const IconData publicRounded =
      IconData(0xe28c, fontFamily: lightFamily);
  static const IconData pushPin =
      IconData(0xe3e2, fontFamily: fillFamily);
  static const IconData pushPinOutlined =
      IconData(0xe3e2, fontFamily: lightFamily);
  static const IconData radioButtonCheckedRounded =
      IconData(0xeb08, fontFamily: lightFamily);
  static const IconData radioButtonUncheckedRounded =
      IconData(0xe18a, fontFamily: lightFamily);
  static const IconData rateReviewOutlined =
      IconData(0xe166, fontFamily: lightFamily);
  static const IconData receiptLongOutlined =
      IconData(0xe3ec, fontFamily: lightFamily);
  static const IconData receiptLongRounded =
      IconData(0xe3ec, fontFamily: lightFamily);
  static const IconData recordVoiceOverOutlined =
      IconData(0xeca8, fontFamily: lightFamily);
  static const IconData refreshRounded =
      IconData(0xe036, fontFamily: lightFamily);
  static const IconData removeCircleOutlineRounded =
      IconData(0xe32c, fontFamily: lightFamily);
  static const IconData removeRounded =
      IconData(0xe32a, fontFamily: lightFamily);
  static const IconData replayRounded =
      IconData(0xe038, fontFamily: lightFamily);
  static const IconData replyRounded =
      IconData(0xe024, fontFamily: lightFamily);
  static const IconData restartAltRounded =
      IconData(0xe038, fontFamily: lightFamily);
  static const IconData sailingRounded =
      IconData(0xe786, fontFamily: lightFamily);
  static const IconData saveOutlined =
      IconData(0xe248, fontFamily: lightFamily);
  static const IconData scheduleRounded =
      IconData(0xe19a, fontFamily: lightFamily);
  static const IconData scheduleSendOutlined =
      IconData(0xed2c, fontFamily: lightFamily);
  static const IconData schoolRounded =
      IconData(0xe62c, fontFamily: lightFamily);
  static const IconData search =
      IconData(0xe30c, fontFamily: lightFamily);
  static const IconData searchOffRounded =
      IconData(0xe30e, fontFamily: lightFamily);
  static const IconData searchOutlined =
      IconData(0xe30c, fontFamily: lightFamily);
  static const IconData searchRounded =
      IconData(0xe30c, fontFamily: lightFamily);
  static const IconData securityRounded =
      IconData(0xe40c, fontFamily: lightFamily);
  static const IconData sendOutlined =
      IconData(0xe398, fontFamily: lightFamily);
  static const IconData sendRounded =
      IconData(0xe398, fontFamily: fillFamily);
  static const IconData settingsOutlined =
      IconData(0xe272, fontFamily: lightFamily);
  static const IconData shieldOutlined =
      IconData(0xe40a, fontFamily: lightFamily);
  static const IconData shieldRounded =
      IconData(0xe40a, fontFamily: fillFamily);
  static const IconData shortTextRounded =
      IconData(0xe484, fontFamily: lightFamily);
  static const IconData slideshowRounded =
      IconData(0xe654, fontFamily: lightFamily);
  static const IconData smartphoneRounded =
      IconData(0xe1e0, fontFamily: lightFamily);
  static const IconData smsOutlined =
      IconData(0xe170, fontFamily: lightFamily);
  static const IconData starBorderRounded =
      IconData(0xe46a, fontFamily: lightFamily);
  static const IconData starHalfRounded =
      IconData(0xe70a, fontFamily: fillFamily);
  static const IconData starOutlineRounded =
      IconData(0xe46a, fontFamily: lightFamily);
  static const IconData starRounded =
      IconData(0xe46a, fontFamily: fillFamily);
  static const IconData stickyNote2Outlined =
      IconData(0xe348, fontFamily: lightFamily);
  static const IconData supportAgentOutlined =
      IconData(0xe584, fontFamily: lightFamily);
  static const IconData supportAgentRounded =
      IconData(0xe584, fontFamily: lightFamily);
  static const IconData tableChartRounded =
      IconData(0xe476, fontFamily: lightFamily);
  static const IconData tagRounded =
      IconData(0xe2a2, fontFamily: lightFamily);
  static const IconData taskAltRounded =
      IconData(0xe184, fontFamily: lightFamily);
  static const IconData thumbUpAltOutlined =
      IconData(0xe48e, fontFamily: lightFamily);
  static const IconData thumbUpAltRounded =
      IconData(0xe48e, fontFamily: fillFamily);
  static const IconData timerOutlined =
      IconData(0xe492, fontFamily: lightFamily);
  static const IconData titleRounded =
      IconData(0xe48a, fontFamily: lightFamily);
  static const IconData translateRounded =
      IconData(0xe4a2, fontFamily: lightFamily);
  static const IconData travelExploreOutlined =
      IconData(0xe28c, fontFamily: lightFamily);
  static const IconData travelExploreRounded =
      IconData(0xe28c, fontFamily: lightFamily);
  static const IconData tuneRounded =
      IconData(0xe434, fontFamily: lightFamily);
  static const IconData unarchiveOutlined =
      IconData(0xe00c, fontFamily: lightFamily);
  static const IconData undoRounded =
      IconData(0xe08a, fontFamily: lightFamily);
  static const IconData uploadFileOutlined =
      IconData(0xe61e, fontFamily: lightFamily);
  static const IconData uploadFileRounded =
      IconData(0xe61e, fontFamily: lightFamily);
  static const IconData verifiedRounded =
      IconData(0xe606, fontFamily: fillFamily);
  static const IconData verifiedUserOutlined =
      IconData(0xe40c, fontFamily: lightFamily);
  static const IconData videocamOffOutlined =
      IconData(0xe4dc, fontFamily: lightFamily);
  static const IconData visibilityOffOutlined =
      IconData(0xe224, fontFamily: lightFamily);
  static const IconData visibilityOutlined =
      IconData(0xe220, fontFamily: lightFamily);
  static const IconData volumeUpRounded =
      IconData(0xe44a, fontFamily: lightFamily);
  static const IconData warningAmberRounded =
      IconData(0xe4e0, fontFamily: lightFamily);
  static const IconData wbSunnyOutlined =
      IconData(0xe472, fontFamily: lightFamily);
  static const IconData wifiOffRounded =
      IconData(0xe4f2, fontFamily: lightFamily);
  static const IconData workOutlineRounded =
      IconData(0xe0ee, fontFamily: lightFamily);
  static const IconData workRounded =
      IconData(0xe0ee, fontFamily: fillFamily);
  static const IconData workspacePremiumOutlined =
      IconData(0xe616, fontFamily: lightFamily);
}
