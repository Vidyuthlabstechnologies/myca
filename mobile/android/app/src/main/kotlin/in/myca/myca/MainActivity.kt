package `in`.myca.myca

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.WindowManager
import java.io.ByteArrayOutputStream
import java.io.InputStream
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private var pending: Map<String, Any>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        remember(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        remember(intent)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "take") {
                val taken = pending
                pending = null
                result.success(taken)
            } else {
                result.notImplemented()
            }
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, DEVICE_CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "facts") result.success(deviceFacts()) else result.notImplemented()
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SECURE_CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "set") {
                if (call.arguments == true) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
                result.success(null)
            } else {
                result.notImplemented()
            }
        }
    }

    private fun deviceFacts(): Map<String, String> = mapOf(
        "osVersion" to Build.VERSION.RELEASE.orEmpty(),
        "manufacturer" to Build.MANUFACTURER.orEmpty(),
        "model" to Build.MODEL.orEmpty(),
    )

    private fun remember(intent: Intent?) {
        if (intent == null || intent.action != Intent.ACTION_SEND) return
        val uri: Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)
        if (uri == null) {
            val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString() ?: return
            if (text.isBlank()) return
            val bytes = text.toByteArray(Charsets.UTF_8)
            pending = if (bytes.size > MAX_BYTES) {
                mapOf("tooLarge" to true)
            } else {
                mapOf("name" to "shared.txt", "mime" to "text/plain", "bytes" to bytes)
            }
            intent.action = null
            return
        }
        if (uri.scheme != ContentResolver.SCHEME_CONTENT) return
        val authority = uri.authority ?: return
        val owner = packageManager.resolveContentProvider(authority, 0)?.packageName
        if (owner == null || owner == packageName) return
        val mime = contentResolver.getType(uri) ?: return
        if (!ACCEPTED.any { mime.startsWith(it) }) return
        val bytes = try {
            contentResolver.openInputStream(uri)?.use { readBounded(it) } ?: return
        } catch (_: Exception) {
            return
        }
        pending = if (bytes == null) {
            mapOf("tooLarge" to true)
        } else {
            mapOf("name" to nameOf(uri), "mime" to mime, "bytes" to bytes)
        }
        intent.action = null
    }

    private fun readBounded(input: InputStream): ByteArray? {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) return out.toByteArray()
            if (out.size() + read > MAX_BYTES) return null
            out.write(buffer, 0, read)
        }
    }

    private fun nameOf(uri: Uri): String {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (column >= 0 && cursor.moveToFirst()) {
                val name = cursor.getString(column)
                if (!name.isNullOrBlank()) return name
            }
        }
        return uri.lastPathSegment ?: "shared"
    }

    companion object {
        const val CHANNEL = "in.myca/share"
        const val SECURE_CHANNEL = "in.myca/secure"
        const val DEVICE_CHANNEL = "in.myca/device"
        const val MAX_BYTES = 8 * 1024 * 1024
        val ACCEPTED = listOf("image/", "application/pdf", "text/")
    }
}
