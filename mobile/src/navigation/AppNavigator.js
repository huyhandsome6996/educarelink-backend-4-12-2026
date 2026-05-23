import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator } from 'react-native';

import { useAuth } from '../context/AuthContext';

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

// Worker Screens
import WorkerFeedScreen from '../screens/Worker/WorkerFeedScreen';
import TaskDetailScreen from '../screens/Worker/TaskDetailScreen';
import MyJobsScreen from '../screens/Worker/MyJobsScreen';
import WorkerProfileScreen from '../screens/Worker/WorkerProfileScreen';

// Chatbot (dùng chung)
import ChatbotScreen from '../screens/ChatbotScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// === Tab Navigator dành cho PHỤHUYNH ===
function ParentTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'ParentHome') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'MyTasks') iconName = focused ? 'briefcase' : 'briefcase-outline';
          else if (route.name === 'Chatbot') iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#0051d5',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { paddingBottom: 6, paddingTop: 4, height: 60 },
        headerShown: false,
      })}
    >
      <Tab.Screen name="ParentHome" component={ParentHomeScreen} options={{ tabBarLabel: 'Trang chủ' }} />
      <Tab.Screen name="MyTasks" component={MyTasksScreen} options={{ tabBarLabel: 'Việc của tôi' }} />
      <Tab.Screen name="Chatbot" component={ChatbotScreen} options={{ tabBarLabel: 'AI Chatbot' }} />
    </Tab.Navigator>
  );
}

// === Tab Navigator dành cho SINH VIÊN ===
function WorkerTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'WorkerFeed') iconName = focused ? 'search' : 'search-outline';
          else if (route.name === 'MyJobs') iconName = focused ? 'document-text' : 'document-text-outline';
          else if (route.name === 'WorkerProfile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#0d9488',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { paddingBottom: 6, paddingTop: 4, height: 60 },
        headerShown: false,
      })}
    >
      <Tab.Screen name="WorkerFeed" component={WorkerFeedScreen} options={{ tabBarLabel: 'Tìm việc' }} />
      <Tab.Screen name="MyJobs" component={MyJobsScreen} options={{ tabBarLabel: 'Việc của tôi' }} />
      <Tab.Screen name="WorkerProfile" component={WorkerProfileScreen} options={{ tabBarLabel: 'Hồ sơ' }} />
    </Tab.Navigator>
  );
}

// === Root Navigator ===
export default function AppNavigator() {
  const { user, isLoading } = useAuth();

  // Hiển thị loading khi app đang khởi động kiểm tra token
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' }}>
        <ActivityIndicator size="large" color="#0051d5" />
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
