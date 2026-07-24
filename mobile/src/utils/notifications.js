import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Không được cấp quyền thông báo!');
        return null;
      }
    } catch (e) {
      console.log('Lỗi khi xin quyền thông báo (Có thể do Expo Go SDK 53+):', e);
      return null;
    }
    
    try {
      // Fix C1: projectId phải là EAS project ID (UUID), không phải slug.
      // Nếu dùng slug ('educarelink') → Expo Push API trả token invalid → push silent fail.
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: '3e841ddf-23c3-42ce-a2e1-8827c06311a2',
      })).data;
      console.log('Push token:', token);
    } catch (e) {
      console.log('🔔 LƯU Ý CHO DEMO: Tính năng Push Notification từ xa không được hỗ trợ trực tiếp trên app Expo Go (từ SDK 53). Để test thực tế, cần build file APK/AAB hoặc dùng Development Build.');
    }
  } else {
    console.log('Phải dùng thiết bị thật (điện thoại) để nhận Push Notifications');
  }

  return token;
}
