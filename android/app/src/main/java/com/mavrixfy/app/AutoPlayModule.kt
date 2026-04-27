package com.mavrixfy.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

private const val TAG = "AutoPlayModule"
private const val AUTO_PLAY_ACTION = "com.mavrixfy.app.AUTO_PLAY_TRACKS"
private const val AUTO_MODE_ACTION = "com.mavrixfy.app.AUTO_MODE_CHANGE"
private const val AUTO_SYNC_ACTION = "com.mavrixfy.app.AUTO_SYNC_STATE"
private const val AUTO_TRANSPORT_ACTION = "com.mavrixfy.app.AUTO_TRANSPORT_COMMAND"
private const val AUTO_PREFS = "mavrixfy_auto_bridge"
private const val PREF_PENDING_PLAY_PAYLOAD = "pending_play_payload"
private const val PREF_PENDING_TRANSPORT_PAYLOAD = "pending_transport_payload"
private const val EVENT_PLAY  = "AutoPlayTracks"
private const val EVENT_MODE  = "AutoModeChange"
private const val EVENT_TRANSPORT = "AutoTransportCommand"

/**
 * Native module that bridges Android Auto broadcast events to React Native.
 *
 * When MavrixfyAutoService wants to load a new queue into TrackPlayer, it sends
 * a local broadcast with a JSON payload. This module receives that broadcast and
 * emits a React Native event so the JS side can call TrackPlayer.setQueue().
 * 
 * Buffering: If a broadcast arrives before JS registers a listener, we buffer it
 * and deliver it immediately when addListener() is called. This prevents the
 * phone and car from playing different songs when the app is backgrounded.
 */
class AutoPlayModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var listenerCount = 0
    private var lastPlayPayload: String? = null
    private var lastModePayload: String? = null
    private var lastTransportPayload: String? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                AUTO_PLAY_ACTION -> {
                    val payload = intent.getStringExtra("payload") ?: return
                    Log.d(TAG, "Received AUTO_PLAY_TRACKS, payload length=${payload.length}")
                    lastPlayPayload = payload
                    persistPendingPayload(PREF_PENDING_PLAY_PAYLOAD, payload)
                    emitEvent(EVENT_PLAY, payload)
                }
                AUTO_MODE_ACTION -> {
                    val shuffleMode = intent.getIntExtra("shuffleMode", 0)
                    val repeatMode  = intent.getIntExtra("repeatMode", 0)
                    Log.d(TAG, "Received AUTO_MODE_CHANGE shuffle=$shuffleMode repeat=$repeatMode")
                    val payload = """{"shuffleMode":$shuffleMode,"repeatMode":$repeatMode}"""
                    lastModePayload = payload
                    emitEvent(EVENT_MODE, payload)
                }
                AUTO_TRANSPORT_ACTION -> {
                    val payload = intent.getStringExtra("payload") ?: return
                    Log.d(TAG, "Received AUTO_TRANSPORT_COMMAND payload=$payload")
                    lastTransportPayload = payload
                    persistPendingPayload(PREF_PENDING_TRANSPORT_PAYLOAD, payload)
                    emitEvent(EVENT_TRANSPORT, payload)
                }
            }
        }
    }

    override fun getName(): String = "AutoPlayModule"

    @ReactMethod
    fun addListener(eventName: String) {
        if (listenerCount == 0) {
            registerReceiver()
            // Deliver buffered/persisted payloads immediately so phone and car stay in sync
            (readPendingPayload(PREF_PENDING_PLAY_PAYLOAD) ?: lastPlayPayload)?.let { payload ->
                lastPlayPayload = payload
                Log.d(TAG, "Delivering buffered AUTO_PLAY_TRACKS on listener registration")
                emitEvent(EVENT_PLAY, payload)
            }
            lastModePayload?.let { payload ->
                Log.d(TAG, "Delivering buffered AUTO_MODE_CHANGE on listener registration")
                emitEvent(EVENT_MODE, payload)
            }
            (readPendingPayload(PREF_PENDING_TRANSPORT_PAYLOAD) ?: lastTransportPayload)?.let { payload ->
                lastTransportPayload = payload
                Log.d(TAG, "Delivering buffered AUTO_TRANSPORT_COMMAND on listener registration")
                emitEvent(EVENT_TRANSPORT, payload)
            }
        }
        listenerCount++
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount -= count
        if (listenerCount <= 0) {
            listenerCount = 0
            lastPlayPayload = null
            lastModePayload = null
            lastTransportPayload = null
            unregisterReceiver()
        }
    }

    @ReactMethod
    fun syncAutoState(payload: String) {
        if (payload.isBlank()) return

        try {
            reactContext.sendBroadcast(Intent(AUTO_SYNC_ACTION).apply {
                setPackage(reactContext.packageName)
                putExtra("payload", payload)
            })
        } catch (e: Exception) {
            Log.w(TAG, "Failed to send AUTO_SYNC_STATE: ${e.message}")
        }
    }

    @ReactMethod
    fun clearPendingAutoCommand(command: String) {
        val key = when (command.trim().lowercase()) {
            "play" -> PREF_PENDING_PLAY_PAYLOAD
            "transport" -> PREF_PENDING_TRANSPORT_PAYLOAD
            else -> return
        }

        reactContext
            .getSharedPreferences(AUTO_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(key)
            .apply()

        if (key == PREF_PENDING_PLAY_PAYLOAD) {
            lastPlayPayload = null
        } else {
            lastTransportPayload = null
        }
    }

    private fun registerReceiver() {
        try {
            val filter = IntentFilter(AUTO_PLAY_ACTION).apply {
                addAction(AUTO_MODE_ACTION)
                addAction(AUTO_TRANSPORT_ACTION)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                reactContext.registerReceiver(receiver, filter)
            }
            Log.d(TAG, "BroadcastReceiver registered")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to register receiver: ${e.message}")
        }
    }

    private fun unregisterReceiver() {
        try {
            reactContext.unregisterReceiver(receiver)
            Log.d(TAG, "BroadcastReceiver unregistered")
        } catch (_: Exception) {}
    }

    private fun persistPendingPayload(key: String, payload: String) {
        reactContext
            .getSharedPreferences(AUTO_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(key, payload)
            .apply()
    }

    private fun readPendingPayload(key: String): String? {
        return reactContext
            .getSharedPreferences(AUTO_PREFS, Context.MODE_PRIVATE)
            .getString(key, null)
            ?.takeIf { it.isNotBlank() }
    }

    private fun emitEvent(eventName: String, payload: String) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(eventName, payload)
    }
}
