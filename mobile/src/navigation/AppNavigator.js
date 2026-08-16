import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';

import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';

// Auth Screens
import SplashScreen from '../screens/Auth/SplashScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';

// Onboarding Screens
import ParentOnboardingScreen from '../screens/Onboarding/ParentOnboardingScreen';
import WorkerOnboardingScreen from '../screens/Onboarding/WorkerOnboardingScreen';

// Parent Screens
import ParentHomeScreen from '../screens/Parent/ParentHomeScreen';
import CreateTaskScreen from '../screens/Parent/CreateTaskScreen';
import MyTasksScreen from '../screens/Parent/MyTasksScreen';
import CandidatesScreen from '../screens/Parent/CandidatesScreen';
import ReviewScreen from '../screens/Parent/ReviewScreen';
import CandidateProfileScreen from '../screens/Parent/CandidateProfileScreen';
import UpgradeToCarepartnerScreen from '../screens/Parent/UpgradeToCarepartnerScreen';
import ParentProfileScreen from '../screens/Parent/ParentProfileScreen';
import CareDiaryDetailScreen from '../screens/Parent/CareDiaryDetailScreen';
import RewardPointsScreen from '../screens/Parent/RewardPointsScreen';

// Worker Screens
import WorkerFeedScreen from '../screens/Worker/WorkerFeedScreen';
import TaskDetailScreen from '../screens/Worker/TaskDetailScreen';
import MyJobsScreen from '../screens/Worker/MyJobsScreen';
import WorkerProfileScreen from '../screens/Worker/WorkerProfileScreen';
import WorkerChatbotScreen from '../screens/Worker/WorkerChatbotScreen';
import WorkerScreeningStatusScreen from '../screens/Worker/WorkerScreeningStatusScreen';

// Payment Screens
import PaymentSetupScreen from '../screens/Payment/PaymentSetupScreen';
import MyEarningsScreen from '../screens/Payment/MyEarningsScreen';
import SettlementDetailScreen from '../screens/Payment/SettlementDetailScreen';

// Help Center
import HelpCenterScreen from '../screens/HelpCenter/HelpCenterScreen';
import CancellationPolicyScreen from '../screens/HelpCenter/CancellationPolicyScreen';

// Notifications
import NotificationsScreen from '../screens/NotificationsScreen';

// Admin
import AdminDashboardScreen from '../screens/Admin/AdminDashboardScreen';
import AdminModerationScreen from '../screens/Admin/AdminModerationScreen';
import AdminChatbotScreen from '../screens/Admin/AdminChatbotScreen';
import AdminPaymentsScreen from '../screens/Admin/AdminPaymentsScreen';
import AdminTrackingOverviewScreen from '../screens/Admin/AdminTrackingOverviewScreen';
import AdminReviewScreen from '../screens/Admin/AdminReviewScreen';
import AdminSendNotificationScreen from '../screens/Admin/AdminSendNotificationScreen';
import AdminAllTasksScreen from '../screens/Admin/AdminAllTasksScreen';

// Live Tracking (Parent)
import LiveTrackingScreen from '../screens/Parent/LiveTrackingScreen';
import TrackingOverviewScreen from '../screens/Parent/TrackingOverviewScreen';

// Complaint (Worker)
import ComplaintScreen from '../screens/Worker/ComplaintScreen';
import MyComplaintsScreen from '../screens/Worker/MyComplaintsScreen';

// Chatbot (Parent)
import ChatbotScreen from '../screens/ChatbotScreen';

// Image Preview (shared)
import ImagePreviewScreen from '../screens/ImagePreviewScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// === Custom Tab Bar — Warm Professionalism pill style ===
// Active tab: orange pill bg, white icon + label
// Inactive tab: muted icon + label, transparent bg
function TabIcon({ name, focused, color }) {
  const bg = focused ? COLORS.primary : 'transparent';
  const fg = focused ? '#FFFFFF' : COLORS.textMuted;
  return (
    <View style={[styles.tabPill, { backgroundColor: bg }]}>
      <Ionicons name={name} size={22} color={fg} />
    </View>
  );
}

// === Tab Navigator dành cho PHỤ HUYNH ===
// QA-FIX-UI 1.2 (Hướng A): 5 tab đúng thiết kế Stitch AI
//   1. Trang chủ  (ParentHome)
//   2. Nhật ký    (MyTasks — đổi nhãn từ 'Hoạt động')
//   3. AI Trợ lý  (Chatbot)
//   4. Theo dõi   (TrackingOverview — MỚI, tổng hợp các task in_progress)
//   5. Tài khoản  (ParentProfile)
function ParentTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'ParentHome') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'MyTasks') iconName = focused ? 'book' : 'book-outline';
          else if (route.name === 'Chatbot') iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
          else if (route.name === 'TrackingOverview') iconName = focused ? 'radar' : 'radar-outline';
          else if (route.name === 'ParentProfile') iconName = focused ? 'person' : 'person-outline';
          return <TabIcon name={iconName} focused={focused} color={color} />;
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        headerShown: false,
        // ⚠️ tabBarHideOnKeyboard: BẮT BUỘC GIỮ — fix lỗi bàn phím đè lên content (handoff)
        tabBarHideOnKeyboard: true,
      })}
    >
      <Tab.Screen name="ParentHome" component={ParentHomeScreen} options={{ tabBarLabel: 'Trang chủ' }} />
      <Tab.Screen name="MyTasks" component={MyTasksScreen} options={{ tabBarLabel: 'Nhật ký' }} />
      <Tab.Screen name="Chatbot" component={ChatbotScreen} options={{ tabBarLabel: 'AI Trợ lý' }} />
      <Tab.Screen name="TrackingOverview" component={TrackingOverviewScreen} options={{ tabBarLabel: 'Theo dõi' }} />
      <Tab.Screen name="ParentProfile" component={ParentProfileScreen} options={{ tabBarLabel: 'Tài khoản' }} />
    </Tab.Navigator>
  );
}

// === Tab Navigator dành cho SINH VIÊN (4 tabs — thêm AI Trợ lý) ===
function WorkerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'WorkerFeed') iconName = focused ? 'search' : 'search-outline';
          else if (route.name === 'MyJobs') iconName = focused ? 'briefcase' : 'briefcase-outline';
          else if (route.name === 'WorkerChatbot') iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
          else if (route.name === 'WorkerProfile') iconName = focused ? 'person' : 'person-outline';
          return <TabIcon name={iconName} focused={focused} color={color} />;
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        headerShown: false,
        // ⚠️ tabBarHideOnKeyboard: BẮT BUỘC GIỮ — fix lỗi bàn phím đè lên content (handoff)
        tabBarHideOnKeyboard: true,
      })}
    >
      <Tab.Screen name="WorkerFeed" component={WorkerFeedScreen} options={{ tabBarLabel: 'Tìm việc' }} />
      <Tab.Screen name="MyJobs" component={MyJobsScreen} options={{ tabBarLabel: 'Việc của tôi' }} />
      <Tab.Screen name="WorkerChatbot" component={WorkerChatbotScreen} options={{ tabBarLabel: 'AI Trợ lý' }} />
      <Tab.Screen name="WorkerProfile" component={WorkerProfileScreen} options={{ tabBarLabel: 'Tài khoản' }} />
    </Tab.Navigator>
  );
}

// === Root Navigator ===
export default function AppNavigator() {
  const { user, isLoading } = useAuth();

  // Hiển thị loading khi app đang khởi động kiểm tra token
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingLogoWrap}>
          <Ionicons name="heart" size={56} color={COLORS.primary} />
        </View>
        <View style={styles.loadingDot} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Chưa đăng nhập → hiện màn hình Auth
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : user.first_login ? (
          // Đăng nhập lần đầu → hiện Onboarding theo role
          <>
            <Stack.Screen
              name="Onboarding"
              component={user.role === 'worker' ? WorkerOnboardingScreen : ParentOnboardingScreen}
            />
          </>
        ) : user.is_staff ? (
          // Admin → Admin Dashboard + các screen admin mới
          <>
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
            <Stack.Screen name="AdminModeration" component={AdminModerationScreen} />
            <Stack.Screen name="AdminChatbot" component={AdminChatbotScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="AdminPayments" component={AdminPaymentsScreen} />
            <Stack.Screen name="AdminTracking" component={AdminTrackingOverviewScreen} />
            <Stack.Screen name="AdminReview" component={AdminReviewScreen} />
            <Stack.Screen name="AdminSendNotification" component={AdminSendNotificationScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="AdminAllTasks" component={AdminAllTasksScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="ImagePreview" component={ImagePreviewScreen} options={{ presentation: 'modal' }} />
          </>
        ) : user.role === 'parent' ? (
          // Đã đăng nhập là Phụ huynh
          <>
            <Stack.Screen name="ParentTabs" component={ParentTabs} />
            <Stack.Screen name="CreateTask" component={CreateTaskScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Candidates" component={CandidatesScreen} />
            <Stack.Screen name="Review" component={ReviewScreen} />
            <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="PaymentSetup" component={PaymentSetupScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="UpgradeToCarepartner" component={UpgradeToCarepartnerScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
            {/* ParentProfile giờ là tab trong ParentTabs — không cần Stack.Screen riêng */}
            <Stack.Screen name="CareDiaryDetail" component={CareDiaryDetailScreen} />
            <Stack.Screen name="RewardPoints" component={RewardPointsScreen} />
            <Stack.Screen name="CancellationPolicy" component={CancellationPolicyScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="ImagePreview" component={ImagePreviewScreen} options={{ presentation: 'modal' }} />
          </>
        ) : (
          // Đã đăng nhập là Sinh viên (worker)
          <>
            <Stack.Screen name="WorkerTabs" component={WorkerTabs} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
            <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="MyEarnings" component={MyEarningsScreen} />
            <Stack.Screen name="SettlementDetail" component={SettlementDetailScreen} />
            <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
            <Stack.Screen name="Complaint" component={ComplaintScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="MyComplaints" component={MyComplaintsScreen} />
            <Stack.Screen name="WorkerScreeningStatus" component={WorkerScreeningStatusScreen} />
            <Stack.Screen name="ImagePreview" component={ImagePreviewScreen} options={{ presentation: 'modal' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingLogo: {
    width: 60,
    height: 60,
    borderRadius: 12,
    marginBottom: 20,
  },
  loadingLogoWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingDot: {
    position: 'absolute',
    top: '38%',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.primaryLight,
    opacity: 0.4,
  },
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 88 : 84,
    paddingBottom: Platform.OS === 'ios' ? 28 : 24,
    paddingTop: 6,
    // P0 FIX (v1.1.5): Thay boxShadow CSS string bằng proper shadow props + elevation
    // để tránh jank trên Android (boxShadow render qua Yoga, không dùng native elevation)
    shadowColor: '#F26522',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  tabBarLabel: {
    ...TYPO.caption,
    marginTop: 4,
    fontSize: 11,
  },
  tabBarItem: {
    paddingTop: 2,
    paddingHorizontal: 4,
  },
  tabPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    minHeight: 40,
  },
});
