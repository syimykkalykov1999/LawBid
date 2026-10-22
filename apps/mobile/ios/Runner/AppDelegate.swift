import AVFoundation
import CallKit
import Flutter
import PushKit
import UIKit
import UserNotifications
import flutter_callkit_incoming

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate,
  PKPushRegistryDelegate, CallkitIncomingAppDelegate
{
  /// Owner 2026-10-17: incoming calls arrive as VoIP (PushKit) pushes so
  /// iOS shows the call screen and rings even when the app is closed.
  private var voipRegistry: PKPushRegistry?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    voipRegistry = registry
    configureAudioSessionOnce()
    // Planner reminders armed by flutter_local_notifications show while the
    // app is open too.
    UNUserNotificationCenter.current().delegate = self
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /// Owner 2026-10-19 (the click when a video starts / stops): the audio
  /// session's category is set ONCE, at launch — playback (sound with the
  /// silent switch on, like Instagram), movie playback mode. video_player
  /// only changes the category when it differs ("upgrade"), so with this in
  /// place no player switches the session when a reel starts, loops or is
  /// swiped away. It is not activated here (that would stop the person's
  /// music the moment the app opens); the first video with sound activates
  /// it and it stays active. Calls (CallKit / WebRTC) still set their own
  /// mode while a call is on.
  private func configureAudioSessionOnce() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .moviePlayback, options: [])
    } catch {
      NSLog("audio session: \(error)")
    }
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "LawbidChatNotifications") {
      registerChatNotifications(registrar.messenger())
    }
  }

  // MARK: - Chat notifications

  /// Owner 2026-10-22 (message pushes like WhatsApp): the names saved in the
  /// phone book for LawBid contacts go to the App Group the chat push
  /// extension reads (NotificationService/NotificationService.swift); an
  /// opened chat takes its notifications (one thread per chat) off the
  /// lock screen; a sign-out clears them all. Taps are FCM's own
  /// (onMessageOpenedApp), so `pendingOpen` has nothing to say here.
  private func registerChatNotifications(_ messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(
      name: "lawbid/chat_notifications", binaryMessenger: messenger)
    channel.setMethodCallHandler { call, result in
      let args = call.arguments as? [String: Any]
      let center = UNUserNotificationCenter.current()
      switch call.method {
      case "setContactNames":
        let names = args?["names"] as? [String: String] ?? [:]
        let app = Bundle.main.bundleIdentifier ?? "com.lawbid.lawbid"
        UserDefaults(suiteName: "group.\(app)")?.set(names, forKey: "chatContactNames")
        result(nil)
      case "clear":
        guard let id = args?["conversationId"] as? String, !id.isEmpty else {
          result(nil)
          return
        }
        center.getDeliveredNotifications { delivered in
          let ids = delivered
            .filter { $0.request.content.threadIdentifier == id }
            .map { $0.request.identifier }
          if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
        result(nil)
      case "clearAll":
        center.getDeliveredNotifications { delivered in
          let ids = delivered
            .filter { $0.request.content.userInfo["type"] as? String == "new_message" }
            .map { $0.request.identifier }
          if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
        }
        let app = Bundle.main.bundleIdentifier ?? "com.lawbid.lawbid"
        UserDefaults(suiteName: "group.\(app)")?.removeObject(forKey: "chatContactNames")
        result(nil)
      case "pendingOpen":
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  // MARK: - PushKit

  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate credentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else { return }
    let token = credentials.token.map { String(format: "%02x", $0) }.joined()
    // Dart reads it (getDevicePushTokenVoIP) and sends it to the server.
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP(token)
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    guard type == .voIP else { return }
    SwiftFlutterCallkitIncomingPlugin.sharedInstance?.setDevicePushTokenVoIP("")
  }

  /// iOS requires every VoIP push to report a call to CallKit at once —
  /// the same fields as the Dart side (callkit_bridge.dart), so a call the
  /// open app also shows is one call (same id).
  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    // Without the plugin there is no CallKit provider to report to; finish
    // the push instead of leaving iOS waiting.
    guard let callkit = SwiftFlutterCallkitIncomingPlugin.sharedInstance else {
      completion()
      return
    }
    let p = payload.dictionaryPayload
    let callId = (p["callId"] as? String) ?? UUID().uuidString
    // Owner 2026-10-21: the open app's socket may have reported this very
    // call a moment ago — a second report of the same id would end the one
    // being answered. One CallKit call per call id.
    let shown = callkit.activeCalls().contains { item in
      (item["id"] as? String)?.caseInsensitiveCompare(callId) == .orderedSame
    }
    if shown {
      completion()
      return
    }
    let name = (p["callerName"] as? String) ?? "LawBid"
    let video = (p["video"] as? String) == "1"
    let data = flutter_callkit_incoming.Data(
      id: callId,
      nameCaller: name,
      handle: "LawBid",
      type: video ? 1 : 0
    )
    data.appName = "LawBid"
    data.duration = 45000
    data.extra = [
      "callId": callId,
      "conversationId": (p["conversationId"] as? String) ?? "",
    ]
    data.handleType = "generic"
    data.supportsVideo = video
    data.maximumCallGroups = 1
    data.maximumCallsPerCallGroup = 1
    data.supportsDTMF = false
    data.supportsHolding = false
    data.isShowMissedCallNotification = false
    // "Calls" switched off in Settings: the call shows without a ringtone.
    if (p["silent"] as? String) == "1" {
      data.ringtonePath = "silence"
    }
    callkit.showCallkitIncoming(
      data,
      fromPushKit: true
    ) {
      completion()
    }
  }

  // MARK: - CallKit (CallkitIncomingAppDelegate)

  /// Owner 2026-10-21 (Apple / LiveKit's CallKit design): the call answered
  /// on the system sheet is THE call for its whole life — the answer is
  /// confirmed to iOS at once (a late or missing confirmation ends the
  /// call), it is never ended and re-created, and WebRTC starts its audio
  /// only when iOS hands the audio session over (didActivate).
  func onAccept(_ call: Call, _ action: CXAnswerCallAction) {
    action.fulfill()
  }

  func onDecline(_ call: Call, _ action: CXEndCallAction) {
    action.fulfill()
  }

  func onEnd(_ call: Call, _ action: CXEndCallAction) {
    action.fulfill()
  }

  func onTimeOut(_ call: Call) {}

  func didActivateAudioSession(_ audioSession: AVAudioSession) {
    webrtcAudioSession(activated: true, audioSession)
  }

  func didDeactivateAudioSession(_ audioSession: AVAudioSession) {
    webrtcAudioSession(activated: false, audioSession)
  }

  func providerDidReset() {}

  /// Tells WebRTC's RTCAudioSession that CallKit activated / deactivated
  /// the audio session (looked up by name: the framework ships with
  /// flutter_webrtc, there is no module to import here). Without this
  /// WebRTC never learns the session is live — a call answered from the
  /// sheet has no sound, or its audio unit fails and the call ends.
  private func webrtcAudioSession(activated: Bool, _ session: AVAudioSession) {
    guard let cls = NSClassFromString("RTCAudioSession") else { return }
    guard
      let shared = (cls as AnyObject).perform(NSSelectorFromString("sharedInstance"))?
        .takeUnretainedValue() as? NSObject
    else { return }
    let selector = NSSelectorFromString(
      activated ? "audioSessionDidActivate:" : "audioSessionDidDeactivate:"
    )
    if shared.responds(to: selector) {
      _ = shared.perform(selector, with: session)
    }
  }
}
