import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Kiểm tra SecureStore có sẵn không (cache lại để tránh gọi nhiều lần)
let _secureStoreAvailable = null;

async function isSecureStoreAvailable() {
  if (_secureStoreAvailable !== null) return _secureStoreAvailable;
  try {
    _secureStoreAvailable = await SecureStore.isAvailableAsync();
  } catch (e) {
    _secureStoreAvailable = false;
  }
  return _secureStoreAvailable;
}

export const storage = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    }
    try {
      const available = await isSecureStoreAvailable();
      if (available) {
        return await SecureStore.getItemAsync(key);
      }
      // Fallback: dùng AsyncStorage khi SecureStore không khả dụng (emulator, một số thiết bị)
      return await AsyncStorage.getItem(key);
    } catch (e) {
      // Fallback cuối cùng
      try {
        return await AsyncStorage.getItem(key);
      } catch (e2) {
        return null;
      }
    }
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
      } catch (e) {}
      return;
    }
    try {
      const available = await isSecureStoreAvailable();
      if (available) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
      // Fallback: dùng AsyncStorage
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      try {
        await AsyncStorage.setItem(key, value);
      } catch (e2) {}
    }
  },
  deleteItem: async (key) => {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
      return;
    }
    try {
      const available = await isSecureStoreAvailable();
      if (available) {
        await SecureStore.deleteItemAsync(key);
        return;
      }
      // Fallback: dùng AsyncStorage
      await AsyncStorage.removeItem(key);
    } catch (e) {
      try {
        await AsyncStorage.removeItem(key);
      } catch (e2) {}
    }
  }
};
