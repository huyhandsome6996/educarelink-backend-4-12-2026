// ============================================================
// JobLocationPicker — Map picker dùng chung cho 3 form đăng việc
// Tính năng (Step 1 AC3): tìm kiếm địa điểm + vị trí hiện tại +
// chọn pin thủ công + ghi chú. Dùng MapView nếu có, fallback nhập tay trên web.
// ============================================================

import React, { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { COLORS, SHADOWS } from '../theme/colors';
import apiClient from '../api/client';

let MapView, MapMarker;
if (Platform.OS !== 'web') {
  MapView = require('react-native-maps').default;
  MapMarker = require('react-native-maps').Marker;
}

// Android bản đồ Google cần API key trong manifest; thiếu key thì MapView
// chỉ hiện ô đen — khi đó dùng fallback nhập tọa độ để picker vẫn dùng được.
const googleMapsApiKey = Platform.OS === 'android'
  ? Constants?.expoConfig?.android?.config?.googleMaps?.apiKey
  : undefined;
const canRenderNativeMap = !!MapView && !!googleMapsApiKey;
const showCoordinateInputs = Platform.OS === 'web' || !canRenderNativeMap;

export default function JobLocationPicker({ value, onChange }) {
  const mapRef = useRef(null);
  const [searchText, setSearchText] = useState('');

  const useCurrentLocation = () => {
    // eslint-disable-next-line global-require
    const Location = require('expo-location');
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Từ chối quyền', 'App chưa được cấp quyền vị trí.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        onChange?.(loc);
        mapRef.current?.animateToRegion({ ...loc, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 400);
      } catch (e) {
        Alert.alert('Lỗi', 'Không lấy được vị trí hiện tại.');
      }
    })();
  };

  const applyResult = (row) => {
    const loc = {
      latitude: parseFloat(row.lat),
      longitude: parseFloat(row.lon),
      label: row.display_name || '',
    };
    onChange?.(loc);
    mapRef.current?.animateToRegion({
      latitude: loc.latitude, longitude: loc.longitude,
      latitudeDelta: 0.01, longitudeDelta: 0.01,
    }, 400);
  };

  const searchPlace = async () => {
    if (!searchText.trim()) return;
    const q = searchText.trim();
    // Ưu tiên proxy backend /api/matching/geocode/search/ (QA 2026-09-10:
    // gọi thẳng nominatim.openstreetmap.org bị nhiều mạng ISP/adblock chặn
    // → không tìm được địa điểm. Proxy chạy server-side nên luôn thông).
    try {
      const { data } = await apiClient.get('/matching/geocode/search/', {
        params: { q: `${q} Việt Nam` },
      });
      const rows = Array.isArray(data?.results) ? data.results : [];
      if (rows.length) return applyResult(rows[0]);
      Alert.alert('Không tìm thấy', 'Thử nhập tên địa điểm cụ thể hơn.');
      return;
    } catch (e) {
      // Proxy lỗi (mạng/máy chủ) → thử thẳng Nominatim lần cuối
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ' Việt Nam')}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'EduCareLink/1.0' } });
      const rows = await resp.json();
      if (rows?.length) return applyResult(rows[0]);
      Alert.alert('Không tìm thấy', 'Thử nhập tên địa điểm cụ thể hơn.');
    } catch (e) {
      Alert.alert('Lỗi', 'Tìm kiếm địa điểm thất bại. Hãy chọn pin trực tiếp trên bản đồ.');
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm địa điểm (VD: Linh Đàm, Hà Nội)"
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={searchPlace}
        />
        <TouchableOpacity style={styles.iconBtn} onPress={searchPlace}>
          <Ionicons name="search" size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={useCurrentLocation}>
          <Ionicons name="locate" size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {Platform.OS !== 'web' && canRenderNativeMap ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: value?.latitude ?? 21.0278,
            longitude: value?.longitude ?? 105.8342,
            latitudeDelta: 0.02, longitudeDelta: 0.02,
          }}
          onPress={(e) => onChange?.(e.nativeEvent.coordinate)}
        >
          {value && <MapMarker coordinate={value} title="Vị trí công việc" />}
        </MapView>
      ) : (
        <View style={[styles.map, styles.webFallback]}>
          <Text style={styles.fallbackText} numberOfLines={3}>
            {value
              ? `Đã chọn: ${value.label || `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`}`
              : 'Nhập tên địa điểm ở ô tìm kiếm trên, hoặc dùng nút định vị để chọn vị trí'}
          </Text>
        </View>
      )}

      {showCoordinateInputs && (
        <View style={styles.webCoordRow}>
          <TextInput style={[styles.searchInput, { flex: 1 }]}
            placeholder="Latitude (VD: 21.0278)"
            defaultValue={value?.latitude ? String(value.latitude) : ''}
            onEndEditing={(e) => onChange?.({
              latitude: parseFloat(e.nativeEvent.text) || 0,
              longitude: value?.longitude ?? 105.8342,
            })} />
          <TextInput style={[styles.searchInput, { flex: 1 }]}
            placeholder="Longitude (VD: 105.8342)"
            defaultValue={value?.longitude ? String(value.longitude) : ''}
            onEndEditing={(e) => onChange?.({
              latitude: value?.latitude ?? 21.0278,
              longitude: parseFloat(e.nativeEvent.text) || 0,
            })} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...SHADOWS.small, borderRadius: 12, overflow: 'hidden' },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8, color: COLORS.text },
  iconBtn: { padding: 8 },
  map: { height: 200, width: '100%' },
  webFallback: {
    backgroundColor: COLORS.primaryLight, alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { color: COLORS.textSecondary, fontSize: 13, padding: 12, textAlign: 'center', fontWeight: '600' },
  webCoordRow: {
    flexDirection: 'row', gap: 8, backgroundColor: COLORS.white,
    padding: 8, borderTopWidth: 1, borderTopColor: '#eee',
  },
});
