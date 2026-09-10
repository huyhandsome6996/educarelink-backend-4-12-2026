// ============================================================
// JobLocationPicker.web.js — Web fallback cho Map picker
// Tránh import react-native-maps trên web (native-only library).
// ============================================================

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme/colors';
import apiClient from '../api/client';

export default function JobLocationPicker({ value, onChange }) {
  const [searchText, setSearchText] = useState('');

  const useCurrentLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          onChange?.(loc);
        },
        (err) => {
          Alert.alert('Lỗi', 'Không lấy được vị trí hiện tại từ trình duyệt.');
        }
      );
    } else {
      Alert.alert('Không hỗ trợ', 'Trình duyệt không hỗ trợ Geolocation.');
    }
  };

  const applyResult = (row) => {
    const loc = {
      latitude: parseFloat(row.lat),
      longitude: parseFloat(row.lon),
      label: row.display_name || '',
    };
    onChange?.(loc);
  };

  const searchPlace = async () => {
    if (!searchText.trim()) return;
    const q = searchText.trim();
    try {
      const { data } = await apiClient.get('/matching/geocode/search/', {
        params: { q: `${q} Việt Nam` },
      });
      const rows = Array.isArray(data?.results) ? data.results : [];
      if (rows.length) return applyResult(rows[0]);
      Alert.alert('Không tìm thấy', 'Thử nhập tên địa điểm cụ thể hơn.');
      return;
    } catch (e) {
      // Fallback Nominatim
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ' Việt Nam')}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'EduCareLink/1.0' } });
      const rows = await resp.json();
      if (rows?.length) return applyResult(rows[0]);
      Alert.alert('Không tìm thấy', 'Thử nhập tên địa điểm cụ thể hơn.');
    } catch (e) {
      Alert.alert('Lỗi', 'Tìm kiếm địa điểm thất bại.');
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

      <View style={[styles.map, styles.webFallback]}>
        <Text style={styles.fallbackText} numberOfLines={3}>
          {value
            ? `Đã chọn: ${value.label || `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`}`
            : 'Nhập tên địa điểm ở ô tìm kiếm trên, hoặc dùng nút định vị để chọn vị trí'}
        </Text>
      </View>

      <View style={styles.webCoordRow}>
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Latitude (VD: 21.0278)"
          defaultValue={value?.latitude ? String(value.latitude) : ''}
          onEndEditing={(e) => onChange?.({
            latitude: parseFloat(e.nativeEvent.text) || 0,
            longitude: value?.longitude ?? 105.8342,
          })}
        />
        <TextInput
          style={[styles.searchInput, { flex: 1 }]}
          placeholder="Longitude (VD: 105.8342)"
          defaultValue={value?.longitude ? String(value.longitude) : ''}
          onEndEditing={(e) => onChange?.({
            latitude: value?.latitude ?? 21.0278,
            longitude: parseFloat(e.nativeEvent.text) || 0,
          })}
        />
      </View>
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
