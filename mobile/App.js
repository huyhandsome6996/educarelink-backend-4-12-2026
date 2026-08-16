import { useEffect, useState } from 'react';
import { Platform, AppState, Alert, Linking, Vibration, View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { storage } from './src/utils/storage';
import { COLORS } from './src/theme/colors';
import ErrorBoundary from './src/components/ErrorBoundary';

// ============================================================
// Font assets — import tĩnh để Metro bundler ship .ttf vào APK
// (assetBundlePatterns đã include node_modules/@expo-google-fonts/**)
// ============================================================
import { Manrope_800ExtraBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

// ====================================================================
// App — EduCareLink
// ====================================================================
// v1.1.2: Đổi useFonts → Font.loadAsync thủ công + timeout fallback
// Nếu font load throw hoặc hang >3s → render app với system font anyway
// (tránh black screen khi @expo-google-fonts không load được trong release)
// ====================================================================

const BACKGROUND_FETCH_TASK = 'educarelink-background-fetch';

// Wrap TaskManager.defineTask trong try/catch — nếu native module lỗi
// trong release build, không crash app
try {
  TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    try {
      const savedTaskId = await storage.getItem('tracking_task_id');
      if (savedTaskId) {
        return BackgroundFetch.BackgroundFetchResult.NewData;
      }
      return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (e) {
      console.warn('[BackgroundFetch] error:', e);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch (e) {
  console.warn('[App] TaskManager.defineTask failed (non-fatal):', e);
}

function useNotificationChannels() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    try {
      Notifications.setNotificationChannelAsync('default', {
        name: 'EduCareLink',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#F26522',
      });
      Notifications.setNotificationChannelAsync('critical_alerts', {
        name: 'Cảnh báo khẩn cấp',
        description: 'Cảnh báo khi thiết bị Carepartner mất kết nối',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 1000, 500, 1000, 500, 1000, 500, 1000],
        lightColor: '#EF4444',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      Notifications.setNotificationChannelAsync('sos_alerts', {
        name: 'SOS',
        description: 'Cảnh báo SOS khẩn cấp',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 800, 400, 800, 400, 800],
        lightColor: '#EF4444',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      Notifications.setNotificationChannelAsync('geofence_alerts', {
        name: 'Vùng an toàn',
        description: 'Cảnh báo khi Carepartner rời vùng an toàn',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lightColor: '#F59E0B',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      Notifications.setNotificationChannelAsync('recovery_alerts', {
        name: 'Phục hồi',
        description: 'Thông báo khi thiết bị/tracking phục hồi',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#10B981',
        sound: 'default',
        enableVibrate: true,
        showBadge: false,
      });
    } catch (e) {
      console.warn('[App] Notification channel setup failed (non-fatal):', e);
    }
  }, []);
}

function useAutoResumeTracking() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || user.role !== 'worker' || Platform.OS === 'web') return;
    let mounted = true;
    const resume = async () => {
      try {
        const { autoResumeTracking } = await import('./src/services/LocationService');
        const taskId = await autoResumeTracking();
        if (mounted && taskId) {
          console.log(`[App] Auto-resumed tracking for task #${taskId}`);
        }
      } catch (e) {
        console.warn('[App] Auto-resume failed:', e?.message || e);
      }
    };
    const timer = setTimeout(resume, 2000);
    return () => { mounted = false; clearTimeout(timer); };
  }, [user]);
}

function useTaskEndedListener() {
  useEffect(() => {
    let subscription;
    try {
      subscription = Notifications.addNotificationReceivedListener(async (notification) => {
        const data = notification.request.content.data || {};
        if (data.type === 'task_completed' || data.type === 'task_cancelled' || data.type === 'tracking_stopped') {
          try {
            await storage.deleteItem('tracking_task_id');
            const { stopTracking } = await import('./src/services/LocationService');
            await stopTracking();
            if (data.type === 'tracking_stopped') {
              Alert.alert('Theo dõi vị trí đã dừng', notification.request.content.body || 'Phụ huynh đã dừng chia sẻ vị trí.', [{ text: 'OK' }]);
            }
          } catch (e) {
            console.warn('[App] Clear tracking on task_ended failed:', e);
          }
        }
      });
    } catch (e) {
      console.warn('[App] Notification listener setup failed (non-fatal):', e);
    }
    return () => { if (subscription) subscription.remove(); };
  }, []);
}

function useBackgroundFetch() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || user.role !== 'worker' || Platform.OS === 'web') return;
    const registerBackgroundFetch = async () => {
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
        if (isRegistered) return;
        await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
          minimumInterval: 60 * 15,
          stopOnTerminate: false,
          startOnBoot: true,
        });
      } catch (e) {
        console.warn('[BackgroundFetch] register failed (non-fatal):', e);
      }
    };
    registerBackgroundFetch();
  }, [user]);
}

// ====================================================================
// Hook: load fonts thủ công với Font.loadAsync + timeout 3s
// Trả về true khi fonts đã load HOẶC khi timeout chạy ra → render app
// ====================================================================
function useAppFonts() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timeoutHandle;

    const load = async () => {
      try {
        // Timeout 3s — nếu Font.loadAsync hang (hiếm nhưng đã từng xảy ra
        // trong release với @expo-google-fonts), vẫn render app với system font
        timeoutHandle = setTimeout(() => {
          if (mounted) {
            console.warn('[App] Font load timed out after 3s — rendering with system fonts');
            setLoaded(true);
          }
        }, 3000);

        await Font.loadAsync({
          Manrope_800ExtraBold,
          Manrope_700Bold,
          PlusJakartaSans_500Medium,
          PlusJakartaSans_600SemiBold,
          PlusJakartaSans_700Bold,
          PlusJakartaSans_800ExtraBold,
        });

        if (mounted) {
          clearTimeout(timeoutHandle);
          setLoaded(true);
        }
      } catch (e) {
        console.warn('[App] Font.loadAsync failed (non-fatal):', e);
        if (mounted) {
          setError(e);
          clearTimeout(timeoutHandle);
          // Render app anyway with system fonts — better than black screen
          setLoaded(true);
        }
      }
    };

    load();
    return () => {
      mounted = false;
      if (timeoutHandle) clearTimeout(timeoutHandle);
    };
  }, []);

  return { loaded, error };
}

function AppInner() {
  const { loaded, error } = useAppFonts();

  useNotificationChannels();
  useAutoResumeTracking();
  useTaskEndedListener();
  useBackgroundFetch();

  if (!loaded) {
    return (
      <View style={styles.fontLoadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fontLoadingContainer: {
    flex: 1,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
