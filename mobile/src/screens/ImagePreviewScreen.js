import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, StatusBar, Dimensions, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, TYPO } from '../theme/colors';

// ====================================================================
// Image Preview Screen — full screen image viewer
// Sử dụng cho: certificate photo, ID card, complaint evidence, ...
// Navigation params: { uri, title }
// ====================================================================

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ImagePreviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { uri, title } = route.params || {};
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!uri) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title || 'Ảnh'}</Text>
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="image-outline" size={48} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>Không có ảnh để hiển thị</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Xem ảnh'}</Text>
      </View>

      <View style={styles.imageWrap}>
        {isLoading && !error && (
          <ActivityIndicator color={COLORS.primary} size="large" style={styles.loader} />
        )}
        {error ? (
          <View style={styles.errorState}>
            <Ionicons name="alert-circle" size={48} color={COLORS.error} />
            <Text style={styles.errorText}>Không tải được ảnh</Text>
            <Text style={styles.errorUri} numberOfLines={2}>{uri}</Text>
          </View>
        ) : (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            onLoadStart={() => setIsLoading(true)}
            onLoad={() => setIsLoading(false)}
            onError={() => { setError(true); setIsLoading(false); }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  backBtn: { padding: 4 },
  headerTitle: { ...TYPO.h5, color: '#fff', fontWeight: '700', flex: 1 },
  imageWrap: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH, height: SCREEN_HEIGHT - 100,
  },
  loader: { position: 'absolute' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyText: { ...TYPO.body, color: COLORS.textMuted },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 20 },
  errorText: { ...TYPO.h5, color: COLORS.error },
  errorUri: { ...TYPO.caption, color: COLORS.textMuted, textAlign: 'center' },
});
