package com.usaproje.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;

import com.facebook.react.ReactApplication;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

public class SmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null) return;

        StringBuilder messageBody = new StringBuilder();
        String address = "";
        long timestamp = System.currentTimeMillis();

        String format = bundle.getString("format");

        for (Object pdu : pdus) {
            SmsMessage sms = SmsMessage.createFromPdu((byte[]) pdu, format);
            messageBody.append(sms.getMessageBody());

            if (sms.getOriginatingAddress() != null) {
                address = sms.getOriginatingAddress();
            }
            timestamp = sms.getTimestampMillis();
        }

        ReactApplication reactApplication =
                (ReactApplication) context.getApplicationContext();

        ReactContext reactContext =
                reactApplication
                        .getReactNativeHost()
                        .getReactInstanceManager()
                        .getCurrentReactContext();

        if (reactContext != null) {
            WritableMap payload = Arguments.createMap();
            payload.putString("body", messageBody.toString());
            payload.putString("address", address);
            payload.putDouble("timestamp", (double) timestamp);
            reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("SMS_RECEIVED", payload);
        }
    }
}
