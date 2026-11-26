package com.lawbid.lawbid

import android.content.Context
import android.util.Base64
import android.util.Log
import com.google.crypto.tink.HybridDecrypt
import com.google.crypto.tink.KeyTemplate
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.hybrid.HpkeParameters
import com.google.crypto.tink.hybrid.HpkePublicKey
import com.google.crypto.tink.hybrid.HybridConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import java.util.Locale
import org.json.JSONObject

/**
 * M12 (owner 26.11 «в уведомлениях будет текст, как в WhatsApp»): the text
 * of an end-to-end encrypted message in its push, which the server never
 * reads.
 *
 * This phone's push-preview key pair is an HPKE keyset made with Google
 * Tink (Apache-2.0) — DHKEM(X25519, HKDF-SHA256), HKDF-SHA256,
 * ChaCha20Poly1305, NO_PREFIX (RFC 9180) — kept by Tink's
 * AndroidKeysetManager: encrypted in app-private SharedPreferences under an
 * AES-256-GCM master key in the Android Keystore. The public half goes to
 * the server with the push token (Dart `pushPreviewKey`); a sender seals a
 * short preview to it (apps/mobile/lib/features/chat/e2ee/push_preview.dart)
 * and the push carries it as `sealed`. [line] opens it for ChatPushReceiver;
 * any failure → null and the notification keeps the server's «Новое
 * сообщение». The iPhone's twin: NotificationService.swift `PushPreview`.
 */
object PushPreviewKeys {
    private const val TAG = "PushPreviewKeys"
    private const val PREFS = "lawbid_push_preview"
    private const val KEYSET = "push_preview_keyset"
    private const val MASTER_KEY = "android-keystore://lawbid_push_preview_master"
    private const val INFO_LABEL = "lawbid push preview v1"

    private val parameters: HpkeParameters by lazy {
        HpkeParameters.builder()
            .setVariant(HpkeParameters.Variant.NO_PREFIX)
            .setKemId(HpkeParameters.KemId.DHKEM_X25519_HKDF_SHA256)
            .setKdfId(HpkeParameters.KdfId.HKDF_SHA256)
            .setAeadId(HpkeParameters.AeadId.CHACHA20_POLY1305)
            .build()
    }

    /** The keyset, made on first use when [create]; null without one. */
    @Synchronized
    private fun keyset(context: Context, create: Boolean): KeysetHandle? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!create && !prefs.contains(KEYSET)) return null
        HybridConfig.register()
        return AndroidKeysetManager.Builder()
            .withSharedPref(context, KEYSET, PREFS)
            .withKeyTemplate(KeyTemplate.createFrom(parameters))
            .withMasterKeyUri(MASTER_KEY)
            .build()
            .keysetHandle
    }

    /** Base64 of the public key (32 bytes), the pair made on first use; null on any error. */
    fun publicKeyBase64(context: Context): String? = try {
        val primary = keyset(context, create = true)?.publicKeysetHandle?.primary?.key
        val raw = (primary as? HpkePublicKey)?.publicKeyBytes?.toByteArray()
        if (raw != null && raw.size == 32) Base64.encodeToString(raw, Base64.NO_WRAP) else null
    } catch (e: Throwable) {
        Log.w(TAG, "push preview key unavailable", e)
        null
    }

    /** Sign-out: the next account on this phone gets a new key. */
    fun delete(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEYSET).apply()
    }

    /** The banner line of a chat push's [data] (its `sealed`, `conversationId`, `labels`), or null. */
    fun line(context: Context, data: Map<String, String>): String? {
        val sealed = data["sealed"] ?: return null
        val conversation = data["conversationId"]?.takeIf { it.isNotEmpty() } ?: return null
        return try {
            val handle = keyset(context, create = false) ?: return null
            val blob = Base64.decode(sealed, Base64.DEFAULT)
            if (blob.size <= 32 + 16) return null
            val info = (INFO_LABEL + "\u0000" + conversation).toByteArray(Charsets.UTF_8)
            val plain = handle
                .getPrimitive(RegistryConfiguration.get(), HybridDecrypt::class.java)
                .decrypt(blob, info)
            format(String(plain, Charsets.UTF_8), labels(data["labels"]))
        } catch (e: Throwable) {
            null
        }
    }

    private fun labels(json: String?): Map<String, String> {
        val out = mutableMapOf(
            "photo" to "Photo",
            "video" to "Video",
            "file" to "File",
            "voice" to "Voice message",
        )
        try {
            if (json != null) {
                val o = JSONObject(json)
                for (k in o.keys()) o.optString(k).takeIf { it.isNotEmpty() }?.let { out[k] = it }
            }
        } catch (e: Exception) {
            // English words then.
        }
        return out
    }

    /** `{"v":1,"k":kind,"t":text,"ms":…}` → «text», «📷 Фото», «🎤 Голосовое сообщение 0:12» … */
    private fun format(json: String, l: Map<String, String>): String? {
        val o = JSONObject(json)
        if (o.optInt("v") != 1) return null
        val text = o.optString("t").trim()
        val line = when (o.optString("k", "text")) {
            "photo" -> "📷 " + text.ifEmpty { l["photo"].orEmpty() }
            "video" -> "🎥 " + text.ifEmpty { l["video"].orEmpty() }
            "file" -> "📎 " + l["file"].orEmpty() + (if (text.isEmpty()) "" else ": $text")
            "voice" -> {
                val ms = o.optLong("ms")
                "🎤 " + l["voice"].orEmpty() +
                    (if (ms > 0) {
                        String.format(Locale.ROOT, " %d:%02d", ms / 60000, (ms / 1000) % 60)
                    } else {
                        ""
                    })
            }
            else -> text
        }
        return line.ifEmpty { null }
    }
}
