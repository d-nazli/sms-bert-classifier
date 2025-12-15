package com.usaproje.sms

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SmsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SmsModule"

    @ReactMethod
    fun getInbox(limit: Int, promise: Promise) {
        val hasPermission = ContextCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasPermission) {
            promise.reject("NO_PERMISSION", "READ_SMS izni verilmedi.")
            return
        }

        val resolver = reactApplicationContext.contentResolver
        val cursor = resolver.query(
            Uri.parse("content://sms/inbox"),
            arrayOf("_id", "address", "body", "date", "read", "type"),
            null,
            null,
            "date DESC LIMIT $limit"
        )

        val result = Arguments.createArray()

        cursor?.use {
            val idIdx = it.getColumnIndex("_id")
            val addressIdx = it.getColumnIndex("address")
            val bodyIdx = it.getColumnIndex("body")
            val dateIdx = it.getColumnIndex("date")
            val readIdx = it.getColumnIndex("read")
            val typeIdx = it.getColumnIndex("type")

            while (it.moveToNext()) {
                val map = Arguments.createMap()
                map.putString("id", it.getString(idIdx))
                map.putString("address", it.getString(addressIdx) ?: "")
                map.putString("body", it.getString(bodyIdx) ?: "")
                map.putDouble("timestamp", it.getLong(dateIdx).toDouble())
                map.putInt("read", it.getInt(readIdx))
                map.putInt("type", it.getInt(typeIdx))
                result.pushMap(map)
            }
        }

        promise.resolve(result)
    }
}

