// ============================================================
// NotificationListener — Step 8.4: tiếng kêu to cho push critical
// Đăng ký Android channel 'educarelink_critical' (importance MAX +
// sound critical_alert.wav + vibration 3 lần) lúc app khởi động.
//
// 2026-09-20 — BỘ ÂM THANH MỚI THEO YÊU CẦU:
//   1. job_assigned (Phụ huynh chọn CarePartner) →
//      "Chuông CarePartner - Có Phụ Huynh Lựa Chọn" (chuong_carepartner.wav)
//      PHÁT LẶP LIỀN trong 1 PHÚT khi app foreground (dừng sớm nếu app
//      background; push OS trên channel educarelink_job_offer vẫn reo).
//   2. admin_notification (Admin gửi thông báo) →
//      nhạc tin nhắn Messenger (messenger_notification.mp3) 1 lần.
//   3. critical khác → critical_alert.wav 1 lần (giữ nguyên hành vi cũ).
//
// VÌ SAO CẦN expo-av: Android FOREGROUND thường KHÔNG phát sound của
// notification → khi nhận push khi app đang mở, component này phát THÊM
// sound local + haptic để đảm bảo "kêu to" đúng spec.
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
const JOB_OFFER_CHANNEL_ID = 'educarelink_job_offer';
const ADMIN_CHANNEL_ID = 'educarelink_admin';

const CRITICAL_SOUND = require('../../assets/sounds/critical_alert.wav');
// Chuông "Chuông CarePartner - Có Phụ Huynh Lựa Chọn" — lặp 1 phút khi được chọn
const CHUONG_CAREPARTNER_SOUND = require('../../assets/sounds/chuong_carepartner.wav');
// Nhạc thông báo tin nhắn Messenger — khi Admin gửi thông báo
const MESSENGER_SOUND = require('../../assets/sounds/messenger_notification.mp3');

const CHUONG_LOOP_MS = 60000; // chuông reo LẶP LIỀN trong 1 PHÚT

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

  // Chuông "Có Phụ Huynh Lựa Chọn" — push job_assigned (Phụ huynh chọn bạn)
  Notifications.setNotificationChannelAsync(JOB_OFFER_CHANNEL_ID, {
    name: 'EduCareLink - Phụ huynh chọn bạn',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'chuong_carepartner.wav', // res/raw/ nhờ config plugin
    vibrationPattern: [0, 500, 300, 500, 300, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    enableLights: true,
    lightColor: '#F36A04',
  }).catch(() => {});

  // Thông báo Admin — nhạc tin nhắn Messenger thay vì chuông hệ thống
  Notifications.setNotificationChannelAsync(ADMIN_CHANNEL_ID, {
    name: 'Thông báo EduCareLink',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'messenger_notification.mp3', // res/raw/ nhờ config plugin
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableLights: false,
    lightColor: '#F36A04',
    showBadge: true,
  }).catch(() => {});
}

export default function NotificationListener() {
  const criticalSoundRef = useRef(null);
  const chuongSoundRef = useRef(null);
  const messengerSoundRef = useRef(null);
  const chuongStopTimer = useRef(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Preload 3 sound
    (async () => {
      try {
        const { sound } = await AV.Audio.Sound.createAsync(CRITICAL_SOUND, {
          shouldPlay: false, volume: 1.0, isLooping: false,
        });
        criticalSoundRef.current = sound;
      } catch { /* web/desktop không có asset — bỏ qua */ }
      try {
        const { sound: chuong } = await AV.Audio.Sound.createAsync(
          CHUONG_CAREPARTNER_SOUND,
          { shouldPlay: false, volume: 1.0, isLooping: true }, // lặp liên tục
        );
        chuongSoundRef.current = chuong;
      } catch { /* không có asset — bỏ qua */ }
      try {
        const { sound: messenger } = await AV.Audio.Sound.createAsync(MESSENGER_SOUND, {
          shouldPlay: false, volume: 1.0, isLooping: false,
        });
        messengerSoundRef.current = messenger;
      } catch { /* không có asset — bỏ qua */ }
    })();

    const vibrateLoud = async () => {
      if (Platform.OS === 'android') {
        await Haptics.vibrateAsync([0, 500, 300, 500, 300, 500]).catch(() => {});
      }
    };

    // Chuông "Có Phụ Huynh Lựa Chọn" — LẶP LIỀN đúng 1 PHÚT
    const playChuongLoop = async () => {
      try {
        await vibrateLoud();
        if (chuongSoundRef.current) {
          await chuongSoundRef.current.stopAsync().catch(() => {});
          await chuongSoundRef.current.setPositionAsync(0).catch(() => {});
          await chuongSoundRef.current.playAsync(); // isLooping=true → tự lặp
        }
        if (chuongStopTimer.current) clearTimeout(chuongStopTimer.current);
        chuongStopTimer.current = setTimeout(async () => {
          try {
            await chuongSoundRef.current?.stopAsync();
            await chuongSoundRef.current?.setPositionAsync(0);
          } catch { /* đã dừng */ }
        }, CHUONG_LOOP_MS);
      } catch { /* im lặng — push vẫn hiện */ }
    };

    const stopChuong = async () => {
      if (chuongStopTimer.current) {
        clearTimeout(chuongStopTimer.current);
        chuongStopTimer.current = null;
      }
      try {
        await chuongSoundRef.current?.stopAsync();
        await chuongSoundRef.current?.setPositionAsync(0);
      } catch { /* im lặng */ }
    };

    const playOnce = async (soundRef) => {
      try {
        await vibrateLoud();
        await soundRef.current?.replayAsync();
      } catch { /* im lặng — push vẫn hiện */ }
    };

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request?.content?.data || {};
      const klass = data.class
        || (notification.request?.content?.channelId === CRITICAL_CHANNEL_ID ? 'critical' : '');
      const type = data.type || '';
      const isForeground = appState.current === 'active';

      // Task F (2026-09-14) + 2026-09-20: khi app FOREGROUND phải tự phát
      // sound đúng loại (Android foreground không phát sound notification):
      //   - job_assigned → chuông "Có Phụ Huynh Lựa Chọn" LẶP 60 GIÂY
      //   - admin_notification → nhạc tin nhắn Messenger 1 lần
      //   - critical khác → critical_alert.wav 1 lần
      if (!isForeground) {
        // app background: dừng chuông đang lặp (JS bị treo sớm muộn cũng dừng)
        if (type === 'job_assigned') stopChuong();
        return;
      }
      if (type === 'job_assigned') {
        playChuongLoop();
      } else if (type === 'admin_notification') {
        playOnce(messengerSoundRef);
      } else if (type === 'device_offline' || type === 'geofence_exit' || type === 'sos_alert') {
        // Cảnh báo khẩn cấp cho PHỤ HUYNH — còi hú cảnh sát (Police Siren)
        // (foreground fallback; background/killed do channel emergency-alerts
        // với sound police_siren.mp3 phát — xem App.js + utils/notifications.js)
        playOnce(criticalSoundRef);
      } else if (klass === 'critical') {
        playOnce(criticalSoundRef);
      }
    });

    // App rời foreground → dừng chuông ngay (không reo ngầm)
    const appStateSub = AppState.addEventListener('change', (state) => {
      const wasActive = appState.current === 'active';
      appState.current = state;
      if (wasActive && state !== 'active') {
        stopChuong();
      }
    });

    return () => {
      subscription.remove();
      appStateSub?.remove?.();
      if (chuongStopTimer.current) clearTimeout(chuongStopTimer.current);
      criticalSoundRef.current?.unloadAsync?.();
      chuongSoundRef.current?.unloadAsync?.();
      messengerSoundRef.current?.unloadAsync?.();
    };
  }, []);

  return null; // component vô hình — chỉ lắng nghe
}
