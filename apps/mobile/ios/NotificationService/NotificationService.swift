import Intents
import UIKit
import UserNotifications

/// Owner 2026-10-22 (message pushes like WhatsApp / Telegram): a chat push
/// (`data.style == "chat"`, sent with `mutable-content: 1`) becomes a
/// Communication Notification — the sender's round photo instead of the app
/// icon, the name the person saved in the phone book for this LawBid
/// contact, a group titled with the group. The app writes the saved names
/// into the shared App Group (AppDelegate.swift, `lawbid/chat_notifications`).
///
/// Owner 2026-10-26: wired into Runner.xcodeproj (target
/// `NotificationService`, embedded in the app). Apple's side (App ID of the
/// extension, Communication Notifications capability; the App Group for
/// phone-book names) — docs/runbooks/IOS_CHAT_NOTIFICATIONS.md. Without the
/// capability the banner stays the server's alert (title = sender, body =
/// text, stacked per chat) with the app icon; nothing breaks. A
/// notification with a person (`style == "actor"`) gets their photo as an
/// attachment.
class NotificationService: UNNotificationServiceExtension {
  private var contentHandler: ((UNNotificationContent) -> Void)?
  private var bestAttempt: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    self.contentHandler = contentHandler
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent
    else {
      contentHandler(request.content)
      return
    }
    // Owner 2026-10-26: a notification with a person (a bid, a comment, a
    // like, a missed call …): their photo as the picture on the banner.
    if content.userInfo["style"] as? String == "actor" {
      bestAttempt = content
      AvatarCache.file(
        url: content.userInfo["actorAvatar"] as? String,
        key: content.userInfo["actorAvatarKey"] as? String
      ) { [weak self] file in
        if let file = file,
          let attachment = try? UNNotificationAttachment(
            identifier: "actor", url: AvatarCache.copyForAttachment(file), options: nil)
        {
          content.attachments = [attachment]
        }
        self?.finish(content)
      }
      return
    }
    guard content.userInfo["style"] as? String == "chat" else {
      contentHandler(request.content)
      return
    }
    bestAttempt = content
    let info = content.userInfo
    let senderId = info["senderId"] as? String ?? ""
    let group = info["isGroup"] as? String == "1"
    let serverName = info["senderName"] as? String ?? ""
    let saved = ChatContactNames.name(for: senderId)
    let name = saved ?? (serverName.isEmpty ? content.title : serverName)
    let text = info["text"] as? String ?? content.body
    if group {
      // The system shows the sender with the group; the bare text below.
      content.body = text
    } else if let saved = saved {
      content.title = saved
    }
    let conversation = info["conversationId"] as? String ?? ""
    let chatTitle = info["chatTitle"] as? String ?? ""

    let images = DispatchGroup()
    var senderImage: INImage?
    var groupImage: INImage?
    images.enter()
    AvatarCache.image(
      url: info["senderAvatar"] as? String,
      key: info["senderAvatarKey"] as? String
    ) {
      senderImage = $0
      images.leave()
    }
    if group {
      images.enter()
      AvatarCache.image(
        url: info["chatAvatar"] as? String,
        key: info["chatAvatarKey"] as? String
      ) {
        groupImage = $0
        images.leave()
      }
    }
    images.notify(queue: .global()) { [weak self] in
      guard let self = self else { return }
      let sender = INPerson(
        personHandle: INPersonHandle(value: senderId, type: .unknown),
        nameComponents: nil,
        displayName: name,
        image: senderImage,
        contactIdentifier: nil,
        customIdentifier: senderId
      )
      let me = INPerson(
        personHandle: INPersonHandle(value: "me", type: .unknown),
        nameComponents: nil,
        displayName: nil,
        image: nil,
        contactIdentifier: nil,
        customIdentifier: nil,
        isMe: true
      )
      let intent = INSendMessageIntent(
        recipients: group ? [me, sender] : [me],
        outgoingMessageType: .outgoingMessageText,
        content: text,
        speakableGroupName: group ? INSpeakableString(spokenPhrase: chatTitle) : nil,
        conversationIdentifier: conversation,
        serviceName: nil,
        sender: sender,
        attachments: nil
      )
      if group, let groupImage = groupImage {
        intent.setImage(groupImage, forParameterNamed: \.speakableGroupName)
      }
      let interaction = INInteraction(intent: intent, response: nil)
      interaction.direction = .incoming
      interaction.donate { _ in
        do {
          let updated = try content.updating(from: intent)
          self.finish(updated)
        } catch {
          // No Communication Notifications capability: the plain alert.
          self.finish(content)
        }
      }
    }
  }

  override func serviceExtensionTimeWillExpire() {
    if let content = bestAttempt { finish(content) }
  }

  private func finish(_ content: UNNotificationContent) {
    guard let handler = contentHandler else { return }
    contentHandler = nil
    handler(content)
  }
}

/// The names saved in the phone book for LawBid contacts (userId → name),
/// written by the app into the App Group shared with this extension.
enum ChatContactNames {
  static let key = "chatContactNames"

  static func name(for userId: String) -> String? {
    guard !userId.isEmpty,
      let names = AppGroup.defaults?.dictionary(forKey: key) as? [String: String],
      let name = names[userId], !name.isEmpty
    else { return nil }
    return name
  }
}

/// `group.<app bundle id>` — the same for the app and its extension
/// (`<app bundle id>.NotificationService`), in every flavor.
enum AppGroup {
  static var id: String {
    let bundle = Bundle.main.bundleIdentifier ?? "com.lawbid.lawbid"
    let app =
      bundle.hasSuffix(".NotificationService")
      ? String(bundle.dropLast(".NotificationService".count)) : bundle
    return "group.\(app)"
  }

  static var defaults: UserDefaults? { UserDefaults(suiteName: id) }
}

/// Photos by avatar file id (a signed link changes every push, the file
/// does not), kept in the extension's caches.
enum AvatarCache {
  static func image(url: String?, key: String?, done: @escaping (INImage?) -> Void) {
    file(url: url, key: key) { file in
      guard let file = file, let data = try? Data(contentsOf: file) else {
        done(nil)
        return
      }
      done(INImage(imageData: data))
    }
  }

  /// iOS moves an attachment's file into its own store: a copy, so the
  /// cached photo stays for the next push.
  static func copyForAttachment(_ file: URL) -> URL {
    let copy = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString + ".png")
    try? FileManager.default.copyItem(at: file, to: copy)
    return copy
  }

  /// The cached photo file (downloaded once). A missing 256 px preview
  /// (`…_w256` 404) falls back to the full picture of a public link.
  static func file(url: String?, key: String?, done: @escaping (URL?) -> Void) {
    guard let url = url, let link = URL(string: url),
      link.scheme == "https" || link.scheme == "http"
    else {
      done(nil)
      return
    }
    let name = (key?.isEmpty == false ? key! : String(url.hashValue))
      .replacingOccurrences(of: "/", with: "_")
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("chat_avatars", isDirectory: true)
    let file = dir.appendingPathComponent(name + ".png")
    if FileManager.default.fileExists(atPath: file.path) {
      done(file)
      return
    }
    download(link) { data in
      if let data = data {
        store(data, dir: dir, file: file, done: done)
      } else if let full = fullPicture(of: link) {
        download(full) { data in
          if let data = data { store(data, dir: dir, file: file, done: done) } else { done(nil) }
        }
      } else {
        done(nil)
      }
    }
  }

  private static func store(_ data: Data, dir: URL, file: URL, done: (URL?) -> Void) {
    // Kept as PNG so iOS accepts it as an attachment whatever the source.
    guard let image = UIImage(data: data), let png = image.pngData() else {
      done(nil)
      return
    }
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try? png.write(to: file, options: .atomic)
    done(file)
  }

  private static func download(_ link: URL, done: @escaping (Data?) -> Void) {
    var request = URLRequest(url: link)
    request.timeoutInterval = 8
    URLSession.shared.dataTask(with: request) { data, response, _ in
      guard let data = data, data.count < 2 * 1024 * 1024,
        (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? false
      else {
        done(nil)
        return
      }
      done(data)
    }.resume()
  }

  /// `…/<file>_w256` → `…/<file>` for an unsigned link (a signature
  /// covers the exact path).
  private static func fullPicture(of link: URL) -> URL? {
    let s = link.absoluteString
    guard !s.contains("?"),
      let range = s.range(of: "_w[0-9]+(\\.avif)?$", options: .regularExpression)
    else { return nil }
    return URL(string: String(s[..<range.lowerBound]))
  }
}
