import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// ====================================================================
// App — EduCareLink
// ====================================================================
// Setup Android notification channels cho critical alerts (device offline)
// ====================================================================

function useNotificationChannels() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      // Channel mặc định
      Notifications.setNotificationChannelAsync('default', {
        name: 'EduCareLink',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F26522',
      });

      // Channel critical — cho device offline alert (chuông kêu, full screen)
      Notifications.setNotificationChannelAsync('critical_alerts', {
        name: '🚨 Cảnh báo khẩn cấp',
        description: 'Cảnh báo khi thiết bị Carepartner mất kết nối',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 1000, 500, 1000, 500, 1000, 500, 1000],
        lightColor: '#EF4444',
        sound: 'critical.wav',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // Channel SOS
      Notifications.setNotificationChannelAsync('sos_alerts', {
        name: '🆘 SOS',
        description: 'Cảnh báo SOS khẩn cấp',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#EF4444',
        enableVibrate: true,
        showBadge: true,
      });

      // Channel geofence
      Notifications.setNotificationChannelAsync('geofence_alerts', {
        name: '📍 Vùng an toàn',
        description: 'Cảnh báo khi Carepartner rời vùng an toàn',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lightColor: '#F59E0B',
        enableVibrate: true,
        showBadge: true,
      });
    }
  }, []);
}

export default function App() {
  useNotificationChannels();

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
