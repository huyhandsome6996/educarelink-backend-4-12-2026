// ============================================================
// JobLocationPicker — Map picker dùng chung cho 3 form đăng việc
// Tính năng:
// - Bản đồ nhúng Leaflet OpenStreetMap (Carto Voyager tiles) sắc nét,
//   hoạt động 100% trên Android, iOS và Expo Go không cần Google Maps API key.
// - Nút ⛶ Mở rộng toàn màn hình (MapPickerModal) để chọn vị trí thoải mái.
// - Tìm kiếm địa điểm thông minh + Nút định vị GPS hiện tại.
// - Chạm vào bản đồ để đổi vị trí tức thì.
// - Thẻ hiển thị địa chỉ đã chọn sang trọng, xóa bỏ hoàn toàn các ô nhập
//   latitude/longitude thô gây tràn viền, mờ nhòe.
// ============================================================

import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../theme/colors';
import apiClient from '../api/client';
import MapPickerModal from './MapPickerModal';

let WebView = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line global-require
    const rnw = require('react-native-webview');
    WebView = rnw?.WebView || rnw?.default || rnw;
  } catch (e) {
    WebView = null;
  }
}

const DEFAULT_LAT = 21.0278; // Hà Nội
const DEFAULT_LNG = 105.8342;

function buildMapHtml(lat, lng, hasValue) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #F8FAFC; }
    .custom-pin-wrap { display: flex; align-items: center; justify-content: center; }
    .custom-pin {
      background: #F26522;
      width: 26px;
      height: 26px;
      border-radius: 50% 50% 50% 0;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .custom-pin-inner {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      background: white;
    }
    .leaflet-control-attribution { display: none !important; }
    .leaflet-bar { border-radius: 8px !important; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.15) !important; border: none !important; }
    .leaflet-bar a { width: 28px !important; height: 28px !important; line-height: 28px !important; color: #1E293B !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var currentLat = ${lat};
    var currentLng = ${lng};
    var map = L.map('map', { zoomControl: true }).setView([currentLat, currentLng], 15);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    var pinIcon = L.divIcon({
      className: 'custom-pin-wrap',
      html: '<div class="custom-pin"><div class="custom-pin-inner"></div></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 26],
    });

    var marker = null;
    if (${hasValue ? 'true' : 'false'}) {
      marker = L.marker([currentLat, currentLng], { icon: pinIcon }).addTo(map);
    }

    map.on('click', function(e) {
      var lat = e.latlng.lat;
      var lng = e.latlng.lng;
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
      }
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PICK_COORDS',
          latitude: lat,
          longitude: lng
        }));
      }
    });

    window.updateCenter = function(lat, lng) {
      currentLat = lat;
      currentLng = lng;
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
      }
      map.setView([lat, lng], 16);
    };
  </script>
</body>
</html>
`;
}

export default function JobLocationPicker({ value, onChange }) {
  const webViewRef = useRef(null);
  const [searchText, setSearchText] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const initialLat = value?.latitude ?? DEFAULT_LAT;
  const initialLng = value?.longitude ?? DEFAULT_LNG;
  const hasValue = !!(value?.latitude && value?.longitude);

  const mapHtml = buildMapHtml(initialLat, initialLng, hasValue);

  // Nhận thông điệp từ Leaflet WebView khi user chạm vào bản đồ
  const handleMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'PICK_COORDS' || data.type === 'location_picked') {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        let label = data.label || '';
        if (!label) {
          // Thử reverse geocoding
          try {
            const resp = await apiClient.get('/matching/geocode/search/', {
              params: { lat, lon: lng },
            });
            const row = Array.isArray(resp.data?.results) ? resp.data.results[0] : resp.data;
            label = row?.display_name || '';
          } catch {}
          if (!label) {
            try {
              const r = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
                { headers: { 'User-Agent': 'EduCareLink/1.0' } }
              );
              const d = await r.json();
              label = d?.display_name || '';
            } catch {}
          }
        }
        onChange?.({
          latitude: lat,
          longitude: lng,
          label: label || `Vị trí (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
        });
      }
    } catch (e) {
      console.warn('[JobLocationPicker] Lỗi parse message:', e);
    }
  };

  // Sử dụng vị trí GPS hiện tại của điện thoại
  const useCurrentLocation = () => {
    // eslint-disable-next-line global-require
    const Location = require('expo-location');
    (async () => {
      setIsLocating(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Cần cấp quyền', 'EduCareLink cần quyền truy cập vị trí để tự động định vị.');
          return;
        }
        const pos = await Location.getCurrentPositionAsync({});
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let label = 'Vị trí hiện tại của bạn';
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { headers: { 'User-Agent': 'EduCareLink/1.0' } }
          );
          const d = await r.json();
          if (d?.display_name) label = d.display_name;
        } catch {}

        const loc = { latitude: lat, longitude: lng, label };
        onChange?.(loc);
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            if (window.updateCenter) { window.updateCenter(${lat}, ${lng}); }
            true;
          `);
        }
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể lấy được vị trí hiện tại. Vui lòng thử chọn trên bản đồ.');
      } finally {
        setIsLocating(false);
      }
    })();
  };

  // Tìm kiếm địa điểm theo tên
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
        const lat = parseFloat(row.lat);
        const lng = parseFloat(row.lon);
        const loc = {
          latitude: lat,
          longitude: lng,
          label: row.display_name || q,
        };
        onChange?.(loc);
        if (webViewRef.current) {
          webViewRef.current.injectJavaScript(`
            if (window.updateCenter) { window.updateCenter(${lat}, ${lng}); }
            true;
          `);
        }
        return;
      }
      Alert.alert('Không tìm thấy', 'Thử nhập tên địa điểm hoặc phường/quận cụ thể hơn.');
    } catch (e) {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ' Việt Nam')}`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'EduCareLink/1.0' } });
        const rows = await resp.json();
        if (rows?.length) {
          const row = rows[0];
          const lat = parseFloat(row.lat);
          const lng = parseFloat(row.lon);
          const loc = {
            latitude: lat,
            longitude: lng,
            label: row.display_name || q,
          };
          onChange?.(loc);
          if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
              if (window.updateCenter) { window.updateCenter(${lat}, ${lng}); }
              true;
            `);
          }
          return;
        }
        Alert.alert('Không tìm thấy', 'Thử nhập tên địa điểm hoặc phường/quận cụ thể hơn.');
      } catch (err) {
        Alert.alert('Lỗi tìm kiếm', 'Không thể tìm kiếm địa điểm lúc này.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleModalPick = (coords) => {
    const loc = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      label: coords.address || `Vị trí (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`,
    };
    onChange?.(loc);
    setShowModal(false);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.updateCenter) { window.updateCenter(${coords.latitude}, ${coords.longitude}); }
        true;
      `);
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. THANH TÌM KIẾM ĐỊA ĐIỂM */}
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
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#94A3B8" style={{ marginRight: 4 }} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.actionBtnSearch}
          onPress={searchPlace}
          disabled={isSearching}
          activeOpacity={0.8}
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
          activeOpacity={0.8}
        >
          {isLocating ? (
            <ActivityIndicator size="small" color="#F26522" />
          ) : (
            <Ionicons name="locate" size={17} color="#F26522" />
          )}
        </TouchableOpacity>
      </View>

      {/* 2. KHUNG BẢN ĐỒ TƯƠNG TÁC (LEAFLET WEBVIEW) */}
      <View style={styles.mapFrame}>
        {WebView ? (
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            style={styles.mapView}
            scrollEnabled={false}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#F26522" />
                <Text style={styles.loadingText}>Đang tải bản đồ...</Text>
              </View>
            )}
          />
        ) : (
          <View style={styles.fallbackBox}>
            <Ionicons name="map-outline" size={32} color="#F26522" />
            <Text style={styles.fallbackTitle}>Bản đồ vị trí EduCareLink</Text>
            <Text style={styles.fallbackDesc}>
              {value?.label || 'Chạm vào ô tìm kiếm hoặc nút định vị để chọn vị trí'}
            </Text>
          </View>
        )}

        {/* Nút phóng to toàn màn hình */}
        <TouchableOpacity
          style={styles.expandButton}
          onPress={() => setShowModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="scan-outline" size={13} color="#0F172A" />
          <Text style={styles.expandButtonText}>⛶ Phóng to</Text>
        </TouchableOpacity>
      </View>

      {/* 3. THẺ HIỂN THỊ ĐỊA CHỈ ĐÃ CHỌN (GỌN GÀNG, SANG TRỌNG) */}
      {value ? (
        <View style={styles.selectedLocationCard}>
          <View style={styles.selectedIconCircle}>
            <Ionicons name="location" size={16} color="#F26522" />
          </View>
          <View style={styles.selectedTextWrap}>
            <Text style={styles.selectedLocationTitle} numberOfLines={2}>
              {value.label || 'Vị trí đã chọn trên bản đồ'}
            </Text>
            <Text style={styles.selectedCoordsText}>
              Tọa độ: {value.latitude?.toFixed(4)}, {value.longitude?.toFixed(4)} · Đã ghim ✓
            </Text>
          </View>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => onChange?.(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle-outline" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.hintNoticeRow}>
          <Ionicons name="information-circle-outline" size={14} color="#F26522" />
          <Text style={styles.hintNoticeText}>
            Chạm trên bản đồ hoặc nhập địa chỉ để ghim vị trí chính xác
          </Text>
        </View>
      )}

      {/* 4. MODAL BẢN ĐỒ TOÀN MÀN HÌNH NẾU CẦN CHỌN CHI TIẾT */}
      {showModal && (
        <MapPickerModal
          visible={showModal}
          initialCoords={value || { latitude: DEFAULT_LAT, longitude: DEFAULT_LNG }}
          onPick={handleModalPick}
          onClose={() => setShowModal(false)}
        />
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
    height: 190,
    width: '100%',
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  mapView: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  loadingBox: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  loadingText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  fallbackBox: {
    flex: 1,
    backgroundColor: '#FFF9F5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 4,
  },
  fallbackTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  fallbackDesc: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  expandButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.small,
  },
  expandButtonText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F172A',
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
  clearBtn: {
    padding: 4,
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
