// ============================================================
// NotificationListener — Step 8.4: tiếng kêu to cho push critical
// Đăng ký Android channel 'educarelink_critical' (importance MAX +
// sound critical_alert.wav + vibration 3 lần) lúc app khởi động.
//
// VÌ SAO CẦN expo-av: Android FOREGROUND thường KHÔNG phát sound của
// notification → khi nhận push critical khi app đang mở, component này
// phát THÊM sound local + haptic để đảm bảo "kêu to" đúng spec.
//
// Giới hạn iOS (OPEN-QUESTIONS Q7): push thường tôn trọng silent switch;
// chỉ Critical Alerts entitlement (đơn xin Apple riêng) mới ép kêu khi tắt
// chuông — ghi nhận rõ, không quảng cáo tính năng này trên iOS.
// ============================================================

import React, { useEffect, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as AV from 'expo-av';
import * as Haptics from 'expo-haptics';

const CRITICAL_CHANNEL_ID = 'educarelink_critical';
const CRITICAL_SOUND = require('../../assets/sounds/critical_alert.wav');

// Đăng ký channel 1 lần khi import (Android)
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync(CRITICAL_CHANNEL_ID, {
    name: 'EduCareLink - Quan trọng',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'critical_alert.wav', // nằm trong res/raw/ nhờ config plugin
    vibrationPattern: [0, 500, 300, 500, 300, 500], // 3 lần rung (Step 8.2)
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    enableLights: true,
    lightColor: '#F36A04',
  }).catch(() => {});
}

export default function NotificationListener() {
  const soundRef = useRef(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Preload sound
    (async () => {
      try {
        const { sound } = await AV.Audio.Sound.createAsync(CRITICAL_SOUND, {
          shouldPlay: false, volume: 1.0, isLooping: false,
        });
        soundRef.current = sound;
      } catch { /* web/desktop không có asset — bỏ qua */ }
    })();

    const playLoud = async () => {
      try {
        if (Platform.OS === 'android') {
          await Haptics.vibrateAsync([0, 500, 300, 500, 300, 500]);
        }
        await soundRef.current?.replayAsync();
      } catch { /* im lặng — push vẫn hiện */ }
    };

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const klass = notification.request?.content?.data?.class
        || (notification.request?.content?.channelId === CRITICAL_CHANNEL_ID ? 'critical' : '');
      // Foreground Android không phát sound notification → tự phát local
      const isForeground = appState.current === 'active';
      if (klass === 'critical' && isForeground) {
        playLoud();
      }
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      appState.current = state;
    });

    return () => {
      subscription.remove();
      appStateSub?.remove?.();
      soundRef.current?.unloadAsync?.();
    };
  }, []);

  return null; // component vô hình — chỉ lắng nghe
}
