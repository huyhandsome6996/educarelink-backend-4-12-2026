// ============================================================
// ChatLocationPicker.web.js — Web fallback cho chatbot location picker
// (react-native-web không có WebView → dùng geocode search + GPS browser,
//  cùng pattern JobLocationPicker.web.js)
// ============================================================

import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme/colors';
import apiClient from '../api/client';

export default function ChatLocationPicker({ visible, onPick, onClose }) {
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [status, setStatus] = useState('');

  const searchPlace = async () => {
    const q = searchText.trim();
    if (!q) return;
    setIsSearching(true);
    setStatus('');
    try {
      const { data } = await apiClient.get('/matching/geocode/search/', {
        params: { q: `${q} Việt Nam` },
      });
      setResults(data?.results || []);
      if (!data?.results?.length) setStatus('Không tìm thấy địa chỉ. Thử từ khoá khác nhé.');
    } catch (e) {
      setStatus('Lỗi tìm địa chỉ — thử lại giúp mình nhé.');
    } finally {
      setIsSearching(false);
    }
  };

  const useCurrentLocation = () => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setIsSearching(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsSearching(false);
          onPick?.({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            label: 'Vị trí hiện tại của bạn',
          });
        },
        () => {
          setIsSearching(false);
          setStatus('Trình duyệt không cho lấy vị trí hiện tại.');
        },
      );
    } else {
      setStatus('Trình duyệt không hỗ trợ Geolocation.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Chọn vị trí làm việc</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Nhập địa chỉ (VD: 123 Nguyễn Trãi, Quận 1...)"
              placeholderTextColor={COLORS.textMuted}
              onSubmitEditing={searchPlace}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchBtn} onPress={searchPlace} disabled={isSearching}>
              {isSearching
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="search" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.gpsBtn} onPress={useCurrentLocation}>
            <Ionicons name="locate" size={16} color={COLORS.primary} />
            <Text style={styles.gpsText}>Dùng vị trí hiện tại</Text>
          </TouchableOpacity>

          {status ? <Text style={styles.status}>{status}</Text> : null}

          <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
            {results.map((r, idx) => (
              <TouchableOpacity
                key={`${r.lat}_${r.lon}_${idx}`}
                style={styles.resultItem}
                onPress={() => onPick?.({
                  latitude: parseFloat(r.lat),
                  longitude: parseFloat(r.lon),
                  label: r.display_name || `${r.lat}, ${r.lon}`,
                })}
              >
                <Text style={styles.resultText} numberOfLines={2}>
                  {r.display_name || `${r.lat}, ${r.lon}`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 16, maxHeight: '75%', ...SHADOWS.large },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '700' },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  input: {
    flex: 1, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: COLORS.textPrimary,
  },
  searchBtn: {
    width: 42, borderRadius: 12, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  gpsText: { ...TYPO.bodySmall, color: COLORS.primary, fontWeight: '600' },
  status: { ...TYPO.caption, color: COLORS.textSecondary, marginBottom: 6 },
  results: { maxHeight: 220 },
  resultItem: {
    padding: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, marginBottom: 6,
  },
  resultText: { fontSize: 12, color: COLORS.textPrimary },
});
