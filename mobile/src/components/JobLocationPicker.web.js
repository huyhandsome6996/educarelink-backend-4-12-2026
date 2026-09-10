// ============================================================
// JobLocationPicker.web.js — Web fallback cho Map picker
// ============================================================

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme/colors';
import apiClient from '../api/client';

export default function JobLocationPicker({ value, onChange }) {
  const [searchText, setSearchText] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const useCurrentLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          setIsLocating(false);
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          let label = 'Vị trí hiện tại của bạn';
          try {
            const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
              headers: { 'User-Agent': 'EduCareLink/1.0' },
            });
            const d = await r.json();
            if (d?.display_name) label = d.display_name;
          } catch {}
          onChange?.({ latitude: lat, longitude: lng, label });
        },
        (err) => {
          setIsLocating(false);
          Alert.alert('Lỗi', 'Không lấy được vị trí hiện tại từ trình duyệt.');
        }
      );
    } else {
      Alert.alert('Không hỗ trợ', 'Trình duyệt không hỗ trợ Geolocation.');
    }
  };

  const searchPlace = async () => {
    if (!searchText.trim()) return;
    const q = searchText.trim();
    setIsSearching(true);
    try {
      const { data } = await apiClient.get('/matching/geocode/search/', {
        params: { q: `${q} Việt Nam` },
      });
      const rows = Array.isArray(data?.results) ? data.results : [];
      if (rows.length) {
        const row = rows[0];
        onChange?.({
          latitude: parseFloat(row.lat),
          longitude: parseFloat(row.lon),
          label: row.display_name || q,
        });
        return;
      }
    } catch (e) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ' Việt Nam')}`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'EduCareLink/1.0' } });
        const rows = await resp.json();
        if (rows?.length) {
          const row = rows[0];
          onChange?.({
            latitude: parseFloat(row.lat),
            longitude: parseFloat(row.lon),
            label: row.display_name || q,
          });
          return;
        }
      } catch (err) {}
    } finally {
      setIsSearching(false);
    }
    Alert.alert('Không tìm thấy', 'Thử nhập tên địa điểm hoặc phường/quận cụ thể hơn.');
  };

  return (
    <View style={styles.container}>
      {/* Search Row */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={17} color="#94A3B8" style={{ marginLeft: 4 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm địa điểm (VD: Linh Đàm, Cầu Giấy...)"
          placeholderTextColor="#94A3B8"
          value={searchText}
          onChangeText={setSearchText}
          onSubmitEditing={searchPlace}
          returnKeyType="search"
        />
        {!!searchText && (
          <TouchableOpacity onPress={() => setSearchText('')}>
            <Ionicons name="close-circle" size={16} color="#94A3B8" style={{ marginRight: 4 }} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionBtnSearch}
          onPress={searchPlace}
          disabled={isSearching}
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="search" size={15} color="#FFFFFF" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtnLocate}
          onPress={useCurrentLocation}
          disabled={isLocating}
        >
          {isLocating ? (
            <ActivityIndicator size="small" color="#F26522" />
          ) : (
            <Ionicons name="locate" size={17} color="#F26522" />
          )}
        </TouchableOpacity>
      </View>

      {/* Map visual on web */}
      <View style={styles.mapFrame}>
        <View style={styles.mapCenterBox}>
          <Ionicons name="map-outline" size={32} color="#F26522" />
          <Text style={styles.mapCenterTitle}>Bản đồ định vị EduCareLink</Text>
          <Text style={styles.mapCenterDesc}>
            {value?.label || 'Dùng ô tìm kiếm hoặc nút định vị để ghim vị trí'}
          </Text>
        </View>
      </View>

      {/* Selected Location Card */}
      {value ? (
        <View style={styles.selectedLocationCard}>
          <View style={styles.selectedIconCircle}>
            <Ionicons name="location" size={16} color="#F26522" />
          </View>
          <View style={styles.selectedTextWrap}>
            <Text style={styles.selectedLocationTitle} numberOfLines={2}>
              {value.label || 'Vị trí đã chọn'}
            </Text>
            <Text style={styles.selectedCoordsText}>
              Tọa độ: {value.latitude?.toFixed(4)}, {value.longitude?.toFixed(4)} · Đã ghim ✓
            </Text>
          </View>
          <TouchableOpacity onPress={() => onChange?.(null)}>
            <Ionicons name="close-circle-outline" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.hintNoticeRow}>
          <Ionicons name="information-circle-outline" size={14} color="#F26522" />
          <Text style={styles.hintNoticeText}>
            Nhập địa chỉ hoặc nhấn định vị để ghim vị trí công việc
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 4,
  },
  actionBtnSearch: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F26522',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnLocate: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFF4ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFrame: {
    height: 140,
    width: '100%',
    backgroundColor: '#FFF9F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCenterBox: {
    alignItems: 'center',
    padding: 16,
    gap: 4,
  },
  mapCenterTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  mapCenterDesc: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  selectedLocationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9F5',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#FED7AA',
    gap: 8,
  },
  selectedIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF4ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedTextWrap: {
    flex: 1,
  },
  selectedLocationTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 16,
  },
  selectedCoordsText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
    marginTop: 1,
  },
  hintNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  hintNoticeText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
    flex: 1,
  },
});
