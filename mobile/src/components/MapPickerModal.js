// ============================================================
// MapPickerModal — Bản đồ chọn vị trí cho CreateTaskScreen
//
// Tương tự web (task_create_1.html) — dùng Leaflet + OpenStreetMap.
// Mobile: embed Leaflet trong WebView, giao tiếp RN ↔ WebView qua
// onMessage/postMessage.
//
// Cách dùng:
//   <MapPickerModal
//     visible={true}
//     initialCoords={{ latitude: 10.8231, longitude: 106.6297 }}
//     onPick={({ latitude, longitude, address }) => { ... }}
//     onClose={() => setVisible(false)}
//   />
//
// User flow:
//   1. Modal mở → hiện bản đồ TP.HCM + nút "Vị trí hiện tại"
//   2. User tap trên map → drop pin + reverse geocode → hiện address
//   3. User gõ address vào search bar → forward geocode → move pin
//   4. User bấm "Xác nhận" → onPick({ latitude, longitude, address })
// ============================================================

import React, { useState, useRef, useCallback } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, SIZES, TYPO } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const DEFAULT_LAT = 10.8231;  // TP.HCM
const DEFAULT_LNG = 106.6297;
const DEFAULT_ZOOM = 13;

// ============================================================
// HTML cho WebView — Leaflet + OpenStreetMap (same as web)
// Giao tiếp: WebView postMessage → RN onMessage
// ============================================================
const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #map { z-index: 1; }
    .custom-pin {
      background: #F26522;
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .custom-pin span {
      transform: rotate(45deg);
      color: white;
      font-size: 14px;
      font-weight: bold;
    }
    .info-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: white;
      padding: 12px 16px;
      border-top: 1px solid #e5e5e5;
      z-index: 1000;
      min-height: 60px;
      display: flex;
      align-items: center;
    }
    .info-text {
      flex: 1;
      font-size: 14px;
      color: #261813;
      line-height: 1.4;
    }
    .info-text .label {
      font-size: 11px;
      color: #594138;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .info-text .coords {
      font-size: 12px;
      color: #8a7468;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="info-bar">
    <div class="info-text">
      <div class="label">Vị trí đã chọn</div>
      <div id="address">Chưa chọn — tap vào bản đồ để chọn vị trí</div>
      <div id="coords" class="coords"></div>
    </div>
  </div>
  <script>
    var map = L.map('map').setView([${DEFAULT_LAT}, ${DEFAULT_LNG}], ${DEFAULT_ZOOM});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19
    }).addTo(map);

    var marker = null;
    var currentLat = null;
    var currentLng = null;
    var currentAddress = '';

    function setPin(lat, lng) {
      currentLat = lat;
      currentLng = lng;
      document.getElementById('coords').textContent = lat.toFixed(6) + ', ' + lng.toFixed(6);
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        var icon = L.divIcon({
          className: 'custom-pin-wrap',
          html: '<div class="custom-pin"><span>📍</span></div>',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        marker = L.marker([lat, lng], { icon: icon }).addTo(map);
      }
      map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }

    function reverseGeocode(lat, lng) {
      fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&accept-language=vi')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          currentAddress = data.display_name || ('Vị trí ' + lat.toFixed(4) + ', ' + lng.toFixed(4));
          document.getElementById('address').textContent = currentAddress;
          sendToRN();
        })
        .catch(function() {
          currentAddress = 'Vị trí ' + lat.toFixed(4) + ', ' + lng.toFixed(4);
          document.getElementById('address').textContent = currentAddress;
          sendToRN();
        });
    }

    function sendToRN() {
      var payload = JSON.stringify({
        type: 'location_picked',
        latitude: currentLat,
        longitude: currentLng,
        address: currentAddress,
      });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(payload);
      }
    }

    map.on('click', function(e) {
      setPin(e.latlng.lat, e.latlng.lng);
      reverseGeocode(e.latlng.lat, e.latlng.lng);
    });

    // Listen for commands from RN
    window.addEventListener('message', function(event) {
      try {
        var cmd = JSON.parse(event.data);
        if (cmd.type === 'move_to' && cmd.latitude && cmd.longitude) {
          setPin(cmd.latitude, cmd.longitude);
          reverseGeocode(cmd.latitude, cmd.longitude);
        }
      } catch (e) {}
    });

    // Try to get user's current location on load
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          setPin(pos.coords.latitude, pos.coords.longitude);
          reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        },
        function() {
          // Failed — stay at default
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    }
  </script>
</body>
</html>
`;

export default function MapPickerModal({
  visible,
  initialCoords,
  onPick,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const [pickedLocation, setPickedLocation] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const webViewRef = useRef(null);

  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'location_picked') {
        setPickedLocation({
          latitude: data.latitude,
          longitude: data.longitude,
          address: data.address,
        });
      }
    } catch (e) {
      console.warn('[MapPickerModal] Failed to parse WebView message:', e);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setIsSearching(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&accept-language=vi`
      );
      const results = await resp.json();
      if (results && results.length > 0) {
        const r = results[0];
        const lat = parseFloat(r.lat);
        const lng = parseFloat(r.lon);
        // Send command to WebView to move pin
        if (webViewRef.current) {
          webViewRef.current.postMessage(JSON.stringify({
            type: 'move_to',
            latitude: lat,
            longitude: lng,
          }));
        }
        setPickedLocation({
          latitude: lat,
          longitude: lng,
          address: r.display_name,
        });
      } else {
        Alert.alert('Không tìm thấy', `Không tìm thấy vị trí "${query}". Thử nhập địa chỉ cụ thể hơn.`);
      }
    } catch (e) {
      Alert.alert('Lỗi mạng', 'Không thể tìm kiếm vị trí. Kiểm tra kết nối internet.');
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const handleUseCurrentLocation = useCallback(async () => {
    try {
      const LocationModule = await import('expo-location');
      const { status } = await LocationModule.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Cần quyền vị trí',
          'Để lấy vị trí hiện tại, app cần quyền truy cập vị trí. Bạn có thể vẫn chọn vị trí thủ công trên bản đồ.',
          [{ text: 'OK' }]
        );
        return;
      }
      const loc = await LocationModule.getCurrentPositionAsync({
        accuracy: LocationModule.Accuracy.High,
      });
      const cmd = {
        type: 'move_to',
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      if (webViewRef.current) {
        webViewRef.current.postMessage(JSON.stringify(cmd));
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lấy vị trí hiện tại. Thử chọn thủ công trên bản đồ.');
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!pickedLocation) {
      Alert.alert('Chưa chọn vị trí', 'Hãy tap vào bản đồ để chọn vị trí trước.');
      return;
    }
    onPick(pickedLocation);
    onClose();
  }, [pickedLocation, onPick, onClose]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.headerBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Đóng"
          >
            <Ionicons name="close" size={24} color={COLORS.onSurface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chọn vị trí trên bản đồ</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search-outline" size={18} color={COLORS.outlineVariant} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm địa chỉ... (VD: 123 Lê Lợi, Q1)"
              placeholderTextColor={COLORS.outline}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {isSearching && <ActivityIndicator size="small" color={COLORS.primary} style={styles.searchSpinner} />}
          </View>
          <TouchableOpacity
            style={styles.currentLocationBtn}
            onPress={handleUseCurrentLocation}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Dùng vị trí hiện tại"
          >
            <Ionicons name="locate-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          <WebView
            ref={webViewRef}
            source={{ html: MAP_HTML }}
            onMessage={handleMessage}
            style={styles.webview}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            geolocationEnabled={true}
            originWhitelist={['*']}
          />
        </View>

        {/* Confirm button */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.pickedInfo}>
            {pickedLocation ? (
              <>
                <Text style={styles.pickedAddress} numberOfLines={2}>
                  {pickedLocation.address || 'Đang lấy địa chỉ...'}
                </Text>
                <Text style={styles.pickedCoords}>
                  {pickedLocation.latitude.toFixed(6)}, {pickedLocation.longitude.toFixed(6)}
                </Text>
              </>
            ) : (
              <Text style={styles.pickedPlaceholder}>
                Tap vào bản đồ để chọn vị trí
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.confirmBtn, !pickedLocation && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!pickedLocation}
            activeOpacity={0.9}
          >
            <Text style={styles.confirmBtnText}>Xác nhận</Text>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPO.h4,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: COLORS.surfaceWarm,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    ...TYPO.body,
    color: COLORS.onSurface,
    paddingVertical: 0,
  },
  searchSpinner: {
    marginLeft: 8,
  },
  currentLocationBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.primarySoft,
  },
  // Map
  mapContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  pickedInfo: {
    flex: 1,
  },
  pickedAddress: {
    ...TYPO.body,
    color: COLORS.onSurface,
    lineHeight: 20,
  },
  pickedCoords: {
    ...TYPO.caption,
    color: COLORS.outline,
    marginTop: 2,
  },
  pickedPlaceholder: {
    ...TYPO.body,
    color: COLORS.outline,
    fontStyle: 'italic',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 20,
    height: 48,
    ...SHADOWS.large,
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    ...TYPO.h4,
    color: '#fff',
  },
});
