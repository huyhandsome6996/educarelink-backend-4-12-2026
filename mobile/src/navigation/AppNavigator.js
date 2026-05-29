import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { COLORS, SHADOWS } from '../theme/colors';

// Auth Screens
import SplashScreen from '../screens/Auth/SplashScreen';
import LoginScreen from '../screens/Auth/LoginScreen';
import RegisterScreen from '../screens/Auth/RegisterScreen';

// Parent Screens
import ParentHomeScreen from '../screens/Parent/ParentHomeScreen';
import CreateTaskScreen from '../screens/Parent/CreateTaskScreen';
import MyTasksScreen from '../screens/Parent/MyTasksScreen';
import CandidatesScreen from '../screens/Parent/CandidatesScreen';
import ReviewScreen from '../screens/Parent/ReviewScreen';
import CandidateProfileScreen from '../screens/Parent/CandidateProfileScreen';

// Worker Screens
import WorkerFeedScreen from '../screens/Worker/WorkerFeedScreen';
import TaskDetailScreen from '../screens/Worker/TaskDetailScreen';
import MyJobsScreen from '../screens/Worker/MyJobsScreen';
import WorkerProfileScreen from '../screens/Worker/WorkerProfileScreen';

// Chatbot (dùng chung)
import ChatbotScreen from '../screens/ChatbotScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// === Custom Tab Bar Icon with indicator dot ===
function TabIcon({ name, focused, color }) {
  return (
    <View style={styles.tabIconContainer}>
      <Ionicons name={name} size={24} color={color} />
      {focused && <View style={[styles.activeIndicator, { backgroundColor: color }]} />}
    </View>
  );
}

// === Tab Navigator dành cho PHỤHUYNH ===
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
      })}
    >
      <Tab.Screen name="ParentHome" component={ParentHomeScreen} options={{ tabBarLabel: 'Trang chủ' }} />
      <Tab.Screen name="MyTasks" component={MyTasksScreen} options={{ tabBarLabel: 'Hoạt động' }} />
      <Tab.Screen name="Chatbot" component={ChatbotScreen} options={{ tabBarLabel: 'AI Trợ lý' }} />
    </Tab.Navigator>
  );
}

// === Tab Navigator dành cho SINH VIÊN ===
function WorkerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName;
          if (route.name === 'WorkerFeed') iconName = focused ? 'search' : 'search-outline';
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
      })}
    >
      <Tab.Screen name="WorkerFeed" component={WorkerFeedScreen} options={{ tabBarLabel: 'Tìm việc' }} />
      <Tab.Screen name="MyJobs" component={MyJobsScreen} options={{ tabBarLabel: 'Việc của tôi' }} />
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
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
        ) : user.role === 'parent' ? (
          // Đã đăng nhập là Phụ huynh
          <>
            <Stack.Screen name="ParentTabs" component={ParentTabs} />
            <Stack.Screen name="CreateTask" component={CreateTaskScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="Candidates" component={CandidatesScreen} />
            <Stack.Screen name="Review" component={ReviewScreen} />
            <Stack.Screen name="CandidateProfile" component={CandidateProfileScreen} />
          </>
        ) : (
          // Đã đăng nhập là Sinh viên (worker)
          <>
            <Stack.Screen name="WorkerTabs" component={WorkerTabs} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 0,
    height: Platform.OS === 'ios' ? 88 : 86,
    paddingBottom: Platform.OS === 'ios' ? 28 : 26,
    paddingTop: 8,
    ...SHADOWS.medium,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  tabBarItem: {
    paddingTop: 4,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
  },
});
