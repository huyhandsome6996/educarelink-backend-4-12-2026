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

// Worker Screens
import WorkerFeedScreen from '../screens/Worker/WorkerFeedScreen';
import TaskDetailScreen from '../screens/Worker/TaskDetailScreen';
import MyJobsScreen from '../screens/Worker/MyJobsScreen';
import WorkerProfileScreen from '../screens/Worker/WorkerProfileScreen';
import WorkerChatbotScreen from '../screens/Worker/WorkerChatbotScreen';

// Payment Screens
import PaymentSetupScreen from '../screens/Payment/PaymentSetupScreen';
import MyEarningsScreen from '../screens/Payment/MyEarningsScreen';
import SettlementDetailScreen from '../screens/Payment/SettlementDetailScreen';

// Help Center
import HelpCenterScreen from '../screens/HelpCenter/HelpCenterScreen';

// Notifications
import NotificationsScreen from '../screens/NotificationsScreen';

// Admin
import AdminDashboardScreen from '../screens/Admin/AdminDashboardScreen';
import AdminModerationScreen from '../screens/Admin/AdminModerationScreen';

// Live Tracking (Parent)
import LiveTrackingScreen from '../screens/Parent/LiveTrackingScreen';

// Complaint (Worker)
import ComplaintScreen from '../screens/Worker/ComplaintScreen';

// Chatbot (Parent)
import ChatbotScreen from '../screens/ChatbotScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// === Custom Tab Bar Icon with refined indicator ===
function TabIcon({ name, focused, color }) {
  return (
    <View style={styles.tabIconContainer}>
      <View style={[styles.iconBg, focused && { backgroundColor: COLORS.primaryLight }]}>
        <Ionicons name={name} size={22} color={color} />
      </View>
      {focused && <View style={[styles.activeIndicator, { backgroundColor: color }]} />}
    </View>
  );
}

// === Tab Navigator dành cho PHỤ HUYNH ===
function ParentTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'ParentHome') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'MyTasks') iconName = focused ? 'list' : 'list-outline';
          else if (route.name === 'Chatbot') iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
          return <TabIcon name={iconName} focused={focused} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
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
      <Tab.Screen name="MyTasks" component={MyTasksScreen} options={{ tabBarLabel: 'Hoạt động' }} />
      <Tab.Screen name="Chatbot" component={ChatbotScreen} options={{ tabBarLabel: 'AI Trợ lý' }} />
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
        tabBarActiveTintColor: COLORS.primary,
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
        <Image source={require('../../assets/logo.png')} style={styles.loadingLogo} resizeMode="contain" />
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
          // Admin → Admin Dashboard
          <>
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
            <Stack.Screen name="AdminModeration" component={AdminModerationScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
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
    boxShadow: '0px -2px 12px rgba(242, 101, 34, 0.06)',
  },
  tabBarLabel: {
    ...TYPO.caption,
    marginTop: 2,
  },
  tabBarItem: {
    paddingTop: 2,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  iconBg: {
    width: 40,
    height: 28,
    borderRadius: SIZES.radiusSm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIndicator: {
    width: 16,
    height: 3,
    borderRadius: 1.5,
    marginTop: 2,
  },
});
