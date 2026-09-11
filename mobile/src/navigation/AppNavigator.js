import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
// N — imperative navigation handle cho notification listener (App.js)
import { setRootNavigator } from './RootNavigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';

import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';

// Auth Screens
import SplashScreen from '../screens/Auth/SplashScreen';
import GuestHomeScreen from '../screens/Auth/GuestHomeScreen';
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
import ParentProfileScreen from '../screens/Parent/ParentProfileScreen';
import CareDiaryDetailScreen from '../screens/Parent/CareDiaryDetailScreen';
import CareDiaryHistoryScreen from '../screens/Parent/CareDiaryHistoryScreen';
import RewardPointsScreen from '../screens/Parent/RewardPointsScreen';

// Worker Screens
import WorkerFeedScreen from '../screens/Worker/WorkerFeedScreen';
import TaskDetailScreen from '../screens/Worker/TaskDetailScreen';
import MyJobsScreen from '../screens/Worker/MyJobsScreen';
import WorkerProfileScreen from '../screens/Worker/WorkerProfileScreen';
import WorkerChatbotScreen from '../screens/Worker/WorkerChatbotScreen';
import WorkerScreeningStatusScreen from '../screens/Worker/WorkerScreeningStatusScreen';
import ProfileChangeRequestsScreen from '../screens/Worker/ProfileChangeRequestsScreen';

// Payment Screens
import PaymentSetupScreen from '../screens/Payment/PaymentSetupScreen';
import MyEarningsScreen from '../screens/Payment/MyEarningsScreen';
import SettlementDetailScreen from '../screens/Payment/SettlementDetailScreen';
import PaymentDetailScreen from '../screens/Payment/PaymentDetailScreen';

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

// A2 — Smart Job Matching
import WorkerAvailabilityScreen from '../screens/Worker/WorkerAvailabilityScreen';
import SmartMatchesScreen from '../screens/Parent/SmartMatchesScreen';

// Flow 1 — Ghép cặp Phụ huynh ↔ CarePartner (mới, song song luồng cũ)
// Route name dùng tên riêng để KHÔNG đụng route cũ ('WorkerAvailability',
// 'CandidateProfile', 'MyJobs'):
//   Parent  : JobTypeSelect, TutoringForm, ChildcareForm, PickupForm,
//             CandidatesList, CandidateProfileV2, BookingDetail, WalletCredits
//   Worker  : MatchingAvailability, Blackout, MyBookings, Appeal
import JobTypeSelectScreen from '../screens/Parent/JobTypeSelectScreen';
import TutoringFormScreen from '../screens/Parent/TutoringForm';
import ChildcareFormScreen from '../screens/Parent/ChildcareForm';
import PickupFormScreen from '../screens/Parent/PickupForm';
import CandidatesListScreen from '../screens/Parent/CandidatesListScreen';
import CandidateProfileV2Screen from '../screens/Parent/CandidateProfileV2Screen';
import BookingDetailScreen from '../screens/Parent/BookingDetailScreen';
import WalletScreen from '../screens/Parent/WalletScreen';
import MatchingAvailabilityScreen from '../screens/Worker/AvailabilityScreen';
import BlackoutScreen from '../screens/Worker/BlackoutScreen';
import MyBookingsScreen from '../screens/Worker/MyBookingsScreen';
import AppealScreen from '../screens/Worker/AppealScreen';

// B1 — Care Diary
import CareDiaryFormScreen from '../screens/Worker/CareDiaryFormScreen';

// Chatbot (Parent)
import ChatbotScreen from '../screens/ChatbotScreen';

// Image Preview (shared)
import ImagePreviewScreen from '../screens/ImagePreviewScreen';
import ChatScreen from '../screens/ChatScreen';

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

// === Stacks cho từng Tab của PHỤ HUYNH ===
function ParentHomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ParentHomeMain" component={ParentHomeScreen} />
      <Stack.Screen name="JobTypeSelect" component={JobTypeSelectScreen} />
      <Stack.Screen name="TutoringForm" component={TutoringFormScreen} />
      <Stack.Screen name="ChildcareForm" component={ChildcareFormScreen} />
      <Stack.Screen name="PickupForm" component={PickupFormScreen} />
      <Stack.Screen name="CandidatesList" component={CandidatesListScreen} />
      <Stack.Screen name="CandidateProfileV2" component={CandidateProfileV2Screen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="WalletCredits" component={WalletScreen} />
      <Stack.Screen name="RewardPoints" component={RewardPointsScreen} />
      <Stack.Screen name="RewardPointsScreen" component={RewardPointsScreen} />
      <Stack.Screen name="SmartMatches" component={SmartMatchesScreen} />
      <Stack.Screen name="CareDiaryDetail" component={CareDiaryDetailScreen} />
      <Stack.Screen name="CareDiaryHistory" component={CareDiaryHistoryScreen} />
      <Stack.Screen name="Candidates" component={CandidatesScreen} />
      <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

function ParentTasksStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyTasksMain" component={MyTasksScreen} />
      <Stack.Screen name="Candidates" component={CandidatesScreen} />
      <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
      <Stack.Screen name="Review" component={ReviewScreen} />
      <Stack.Screen name="CareDiaryDetail" component={CareDiaryDetailScreen} />
      <Stack.Screen name="CareDiaryHistory" component={CareDiaryHistoryScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

function ParentTrackingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TrackingOverviewMain" component={TrackingOverviewScreen} />
      <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

function ParentProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ParentProfileMain" component={ParentProfileScreen} />
      <Stack.Screen name="WalletCredits" component={WalletScreen} />
      <Stack.Screen name="RewardPoints" component={RewardPointsScreen} />
      <Stack.Screen name="RewardPointsScreen" component={RewardPointsScreen} />
      <Stack.Screen name="PaymentDetail" component={PaymentDetailScreen} />
      <Stack.Screen name="CareDiaryHistory" component={CareDiaryHistoryScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

// === Tab Navigator dành cho PHỤ HUYNH ===
// Thiết kế 5 tab cân đối: nút AI Trợ lý ở chính giữa trung tâm (Tab 3)
function ParentTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          // Tab giữa (Chatbot) → nút tròn cam nổi
          if (route.name === 'Chatbot') {
            return (
              <View style={styles.raisedFabContainer}>
                <View style={[styles.raisedFab, focused && styles.raisedFabFocused]}>
                  <Ionicons name="hardware-chip" size={26} color="#fff" />
                </View>
              </View>
            );
          }
          let iconName;
          if (route.name === 'ParentHome') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'MyTasks') iconName = focused ? 'list' : 'list-outline';
          else if (route.name === 'TrackingOverview') iconName = focused ? 'location' : 'location-outline';
          else if (route.name === 'ParentProfile') iconName = focused ? 'person' : 'person-outline';
          return <TabIcon name={iconName} focused={focused} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        headerShown: false,
        tabBarHideOnKeyboard: false,
      })}
    >
      <Tab.Screen name="ParentHome" component={ParentHomeStack} options={{ tabBarLabel: 'Trang chủ' }} />
      <Tab.Screen name="MyTasks" component={ParentTasksStack} options={{ tabBarLabel: 'Công việc' }} />
      <Tab.Screen name="Chatbot" component={ChatbotScreen} options={{ tabBarLabel: 'AI Trợ lý' }} />
      <Tab.Screen name="TrackingOverview" component={ParentTrackingStack} options={{ tabBarLabel: 'Theo dõi' }} />
      <Tab.Screen name="ParentProfile" component={ParentProfileStack} options={{ tabBarLabel: 'Tài khoản' }} />
    </Tab.Navigator>
  );
}

// === Stacks cho từng Tab của SINH VIÊN / CAREPARTNER ===
function WorkerFeedStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkerFeedMain" component={WorkerFeedScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
      <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

function WorkerAvailabilityStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MatchingAvailabilityMain" component={MatchingAvailabilityScreen} />
      <Stack.Screen name="MatchingAvailability" component={MatchingAvailabilityScreen} />
      <Stack.Screen name="Blackout" component={BlackoutScreen} />
      <Stack.Screen name="WorkerAvailability" component={WorkerAvailabilityScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

function WorkerJobsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyJobsMain" component={MyJobsScreen} />
      <Stack.Screen name="MyBookings" component={MyBookingsScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
      <Stack.Screen name="CareDiaryForm" component={CareDiaryFormScreen} />
      <Stack.Screen name="CareDiaryDetail" component={CareDiaryDetailScreen} />
      <Stack.Screen name="Appeal" component={AppealScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}

function WorkerProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkerProfileMain" component={WorkerProfileScreen} />
      <Stack.Screen name="MyEarnings" component={MyEarningsScreen} />
      <Stack.Screen name="SettlementDetail" component={SettlementDetailScreen} />
      <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
      <Stack.Screen name="MyComplaints" component={MyComplaintsScreen} />
      <Stack.Screen name="WorkerScreeningStatus" component={WorkerScreeningStatusScreen} />
      <Stack.Screen name="ProfileChangeRequests" component={ProfileChangeRequestsScreen} />
      <Stack.Screen name="PaymentDetail" component={PaymentDetailScreen} />
      <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="MatchingAvailability" component={MatchingAvailabilityScreen} />
      <Stack.Screen name="Blackout" component={BlackoutScreen} />
      <Stack.Screen name="MyBookings" component={MyBookingsScreen} />
      <Stack.Screen name="WorkerAvailability" component={WorkerAvailabilityScreen} />
    </Stack.Navigator>
  );
}

// === Tab Navigator dành cho SINH VIÊN / CAREPARTNER (5 tabs cân đối với AI Trợ lý ở trung tâm) ===
function WorkerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          // Tab giữa (WorkerChatbot) → nút tròn cam nổi
          if (route.name === 'WorkerChatbot') {
            return (
              <View style={styles.raisedFabContainer}>
                <View style={[styles.raisedFab, focused && styles.raisedFabFocused]}>
                  <Ionicons name="hardware-chip" size={26} color="#fff" />
                </View>
              </View>
            );
          }
          let iconName;
          if (route.name === 'WorkerFeed') iconName = focused ? 'search' : 'search-outline';
          else if (route.name === 'MatchingAvailability') iconName = focused ? 'calendar' : 'calendar-outline';
          else if (route.name === 'MyJobs') iconName = focused ? 'briefcase' : 'briefcase-outline';
          else if (route.name === 'WorkerProfile') iconName = focused ? 'person' : 'person-outline';
          return <TabIcon name={iconName} focused={focused} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
        headerShown: false,
        tabBarHideOnKeyboard: false,
      })}
    >
      <Tab.Screen name="WorkerFeed" component={WorkerFeedStack} options={{ tabBarLabel: 'Tìm việc' }} />
      <Tab.Screen name="MatchingAvailability" component={WorkerAvailabilityStack} options={{ tabBarLabel: 'Lịch rảnh' }} />
      <Tab.Screen name="WorkerChatbot" component={WorkerChatbotScreen} options={{ tabBarLabel: 'AI Trợ lý' }} />
      <Tab.Screen name="MyJobs" component={WorkerJobsStack} options={{ tabBarLabel: 'Công việc' }} />
      <Tab.Screen name="WorkerProfile" component={WorkerProfileStack} options={{ tabBarLabel: 'Tài khoản' }} />
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
    <NavigationContainer
      ref={setRootNavigator}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Chưa đăng nhập → hiện GuestHome (Stitch AI design)
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="GuestHome" component={GuestHomeScreen} />
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
            <Stack.Screen name="PaymentSetup" component={PaymentSetupScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="CancellationPolicy" component={CancellationPolicyScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="ImagePreview" component={ImagePreviewScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            {/* Fallback routes trên root stack đảm bảo 100% tương thích ngược */}
            <Stack.Screen name="Candidates" component={CandidatesScreen} />
            <Stack.Screen name="SmartMatches" component={SmartMatchesScreen} />
            <Stack.Screen name="JobTypeSelect" component={JobTypeSelectScreen} />
            <Stack.Screen name="TutoringForm" component={TutoringFormScreen} />
            <Stack.Screen name="ChildcareForm" component={ChildcareFormScreen} />
            <Stack.Screen name="PickupForm" component={PickupFormScreen} />
            <Stack.Screen name="CandidatesList" component={CandidatesListScreen} />
            <Stack.Screen name="CandidateProfileV2" component={CandidateProfileV2Screen} />
            <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
            <Stack.Screen name="WalletCredits" component={WalletScreen} />
            <Stack.Screen name="Review" component={ReviewScreen} />
            <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="LiveTracking" component={LiveTrackingScreen} />
            <Stack.Screen name="CareDiaryDetail" component={CareDiaryDetailScreen} />
            <Stack.Screen name="CareDiaryHistory" component={CareDiaryHistoryScreen} />
            <Stack.Screen name="RewardPoints" component={RewardPointsScreen} />
            <Stack.Screen name="RewardPointsScreen" component={RewardPointsScreen} />
            <Stack.Screen name="PaymentDetail" component={PaymentDetailScreen} />
          </>
        ) : (
          // Đã đăng nhập là Sinh viên (worker)
          <>
            <Stack.Screen name="WorkerTabs" component={WorkerTabs} />
            <Stack.Screen name="Complaint" component={ComplaintScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="ImagePreview" component={ImagePreviewScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Chat" component={ChatScreen} />
            {/* Fallback routes trên root stack đảm bảo 100% tương thích ngược */}
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
            <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="MyEarnings" component={MyEarningsScreen} />
            <Stack.Screen name="SettlementDetail" component={SettlementDetailScreen} />
            <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
            <Stack.Screen name="MyComplaints" component={MyComplaintsScreen} />
            <Stack.Screen name="WorkerScreeningStatus" component={WorkerScreeningStatusScreen} />
            <Stack.Screen name="WorkerAvailability" component={WorkerAvailabilityScreen} />
            <Stack.Screen name="MatchingAvailability" component={MatchingAvailabilityScreen} />
            <Stack.Screen name="Blackout" component={BlackoutScreen} />
            <Stack.Screen name="MyBookings" component={MyBookingsScreen} />
            <Stack.Screen name="Appeal" component={AppealScreen} />
            <Stack.Screen name="CareDiaryForm" component={CareDiaryFormScreen} />
            <Stack.Screen name="ProfileChangeRequests" component={ProfileChangeRequestsScreen} />
            <Stack.Screen name="PaymentDetail" component={PaymentDetailScreen} />
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
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: -0.2,
    marginTop: 2,
    textAlign: 'center',
  },
  tabBarItem: {
    paddingTop: 2,
    paddingHorizontal: 0,
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
  // Raised AI FAB (tab giữa nổi lên — bTaskee style)
  raisedFabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 20 : 24,
  },
  raisedFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.medium,
    elevation: 6,
  },
  raisedFabFocused: {
    backgroundColor: '#D45A1C',
    ...SHADOWS.large,
  },
});
