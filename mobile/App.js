import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

// Cấu hình cách hiển thị thông báo khi đang mở app
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  useEffect(() => {
    // Lắng nghe thông báo khi đang mở app
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log("🔔 Nhận được thông báo:", notification);
    });
    return () => subscription.remove();
  }, []);

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
