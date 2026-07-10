import { useEffect } from 'react';
import { Platform, AppState, Alert, Linking, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { storage } from './src/utils/storage';

// ====================================================================
// App — EduCareLink
// ====================================================================
// Setup:
// 1. Android notification channels cho critical alerts
// 2. Auto-resume tracking khi app mở lại sau kill/reboot
// 3. Background fetch để giữ app sống khi task in_progress
// ====================================================================

// Task name cho background fetch (giữ app sống)
const BACKGROUND_FETCH_TASK = 'educarelink-background-fetch';

// Define background fetch task (must be at module scope)
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const savedTaskId = await storage.getItem('tracking_task_id');
    if (savedTaskId) {
      console.log('[BackgroundFetch] App còn đang trong nhiệm vụ, giữ sống');
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.warn('[BackgroundFetch] error:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

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
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // Channel SOS
      Notifications.setNotificationChannelAsync('sos_alerts', {
        name: '🆘 SOS',
        description: 'Cảnh báo SOS khẩn cấp',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 800, 400, 800, 400, 800],
        lightColor: '#EF4444',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // Channel geofence
      Notifications.setNotificationChannelAsync('geofence_alerts', {
        name: '📍 Vùng an toàn',
        description: 'Cảnh báo khi Carepartner rời vùng an toàn',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lightColor: '#F59E0B',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // Channel recovery
      Notifications.setNotificationChannelAsync('recovery_alerts', {
        name: '✅ Phục hồi',
        description: 'Thông báo khi thiết bị/tracking phục hồi',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#10B981',
        sound: 'default',
        enableVibrate: true,
        showBadge: false,
      });
    }
  }, []);
}

// ====================================================================
// Hook: Auto-resume tracking khi app mở lại + clear khi task ended
// ====================================================================
function useAutoResumeTracking() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'worker') return;  // chỉ carepartner cần resume
    if (Platform.OS === 'web') return;

    let mounted = true;

    const resume = async () => {
      try {
        // Dynamic import để tránh circular dependency
        const { autoResumeTracking } = await import('./src/services/LocationService');
        const taskId = await autoResumeTracking();
        if (mounted && taskId) {
          console.log(`[App] Auto-resumed tracking for task #${taskId}`);
        }
      } catch (e) {
        console.warn('[App] Auto-resume failed:', e.message);
      }
    };

    // Delay 2s để app khởi động xong + AuthContext load xong
    const timer = setTimeout(resume, 2000);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [user]);
}

// ====================================================================
// Hook: Lắng nghe notification task_ended → clear tracking storage
// ====================================================================
function useTaskEndedListener() {
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data || {};
      // Khi task completed/cancelled → clear tracking storage + stop tracking
      if (data.type === 'task_completed' || data.type === 'task_cancelled' || data.type === 'tracking_stopped') {
        console.log('[App] Task ended notification received → clear tracking');
        try {
          await storage.deleteItem('tracking_task_id');
          const { stopTracking } = await import('./src/services/LocationService');
          await stopTracking();

          // Hiện alert cho user biết
          if (data.type === 'tracking_stopped') {
            Alert.alert(
              'ⓘ Theo dõi vị trí đã dừng',
              notification.request.content.body || 'Phụ huynh đã dừng chia sẻ vị trí.',
              [{ text: 'OK' }]
            );
          }
        } catch (e) {
          console.warn('[App] Clear tracking on task_ended failed:', e);
        }
      }
    });
    return () => subscription.remove();
  }, []);
}

// ====================================================================
// Hook: Register background fetch (giữ app sống khi task in_progress)
// ====================================================================
function useBackgroundFetch() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'worker') return;
    if (Platform.OS === 'web') return;

    const registerBackgroundFetch = async () => {
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
        if (isRegistered) {
          console.log('[BackgroundFetch] already registered');
          return;
        }

        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
          minimumInterval: 60 * 15,  // 15 phút (Android minimum)
          stopOnTerminate: false,    // KHÔNG dừng khi app kill → tiếp tục nền
          startOnBoot: true,         // Tự start khi device reboot
        });
        console.log('[BackgroundFetch] registered — app sẽ chạy nền khi task in_progress');
      } catch (e) {
        console.warn('[BackgroundFetch] register failed:', e);
      }
    };

    registerBackgroundFetch();

    return () => {
      // Unregister khi user logout (không phải worker nữa)
      // KHÔNG unregister khi app close — để background fetch tiếp tục
    };
  }, [user]);
}

export default function App() {
  useNotificationChannels();
  useAutoResumeTracking();
  useTaskEndedListener();
  useBackgroundFetch();

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}
