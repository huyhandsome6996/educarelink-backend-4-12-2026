import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar,
  Alert, ActivityIndicator, ScrollView, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { upgradeToCarepartner, getUpgradeStatus } from '../../api/auth';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';

export default function UpgradeToCarepartnerScreen() {
  const navigation = useNavigation();
  const { user, refreshUser } = useAuth();
  const [phone, setPhone] = useState(user?.phone_number || '');
  const [address, setAddress] = useState(user?.address || '');
  const [idCardFront, setIdCardFront] = useState(null);
  const [idCardBack, setIdCardBack] = useState(null);
  const [selfiePhoto, setSelfiePhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const pickImage = async (setter, label) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Cần quyền', 'Vui lòng cấp quyền truy cập thư viện ảnh.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setter(result.assets[0]);
    }
  };

  const takePhoto = async (setter) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Cần quyền', 'Vui lòng cấp quyền camera.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setter(result.assets[0]);
    }
  };

  const handleSubmit = async () => {
    if (!phone.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập số điện thoại.');
      return;
    }
    if (!idCardFront || !idCardBack || !selfiePhoto) {
      Alert.alert('Thiếu ảnh', 'Vui lòng cung cấp đủ ảnh CCCD 2 mặt + ảnh chân dung.');
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('phone_number', phone.trim());
      if (address.trim()) formData.append('address', address.trim());

      formData.append('id_card_front', {
        uri: idCardFront.uri, type: idCardFront.mimeType || 'image/jpeg', name: 'id_card_front.jpg',
      });
      formData.append('id_card_back', {
        uri: idCardBack.uri, type: idCardBack.mimeType || 'image/jpeg', name: 'id_card_back.jpg',
      });
      formData.append('selfie_photo', {
        uri: selfiePhoto.uri, type: selfiePhoto.mimeType || 'image/jpeg', name: 'selfie_photo.jpg',
      });

      await upgradeToCarepartner(formData);

      if (refreshUser) await refreshUser();

      Alert.alert(
        '✅ Đã gửi yêu cầu',
        'Yêu cầu nâng cấp thành Carepartner đã được gửi. Admin sẽ duyệt trong 1-2 ngày làm việc.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      const msg = e.response?.data?.error || 'Không thể gửi yêu cầu. Vui lòng thử lại.';
      Alert.alert('Lỗi', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setIsLoading(false);
    }
  };

  const renderImagePicker = (label, image, setter) => (
    <View style={styles.imagePicker}>
      <Text style={styles.imageLabel}>{label}</Text>
      {image ? (
        <TouchableOpacity onPress={() => pickImage(setter, label)} activeOpacity={0.8}>
          <Image source={{ uri: image.uri }} style={styles.imagePreview} />
          <View style={styles.imageOverlay}>
            <Ionicons name="create-outline" size={14} color="#fff" />
            <Text style={styles.imageOverlayText}>Đổi ảnh</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.imageActions}>
          <TouchableOpacity style={styles.imageBtn} onPress={() => pickImage(setter, label)}>
            <Ionicons name="images-outline" size={18} color={COLORS.primary} />
            <Text style={styles.imageBtnText}>Thư viện</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.imageBtn} onPress={() => takePhoto(setter)}>
            <Ionicons name="camera-outline" size={18} color={COLORS.primary} />
            <Text style={styles.imageBtnText}>Camera</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trở thành Carepartner</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <View style={styles.introIconCircle}>
            <Ionicons name="school" size={28} color={COLORS.primary} />
          </View>
          <Text style={styles.introTitle}>Nâng cấp tài khoản</Text>
          <Text style={styles.introDesc}>
            Bạn đang là Phụ huynh. Nâng cấp lên Carepartner để nhận việc làm và kiếm thêm thu nhập. Tài khoản Carepartner cần được Admin duyệt (1-2 ngày).
          </Text>
        </View>

        <Text style={styles.label}>Số điện thoại *</Text>
        <View style={styles.inputRow}>
          <Ionicons name="call-outline" size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="09xx.xxx.xxx"
            placeholderTextColor={COLORS.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
        </View>

        <Text style={styles.label}>Địa chỉ (tuỳ chọn)</Text>
        <View style={styles.inputRow}>
          <Ionicons name="location-outline" size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="Số nhà, đường, quận, thành phố"
            placeholderTextColor={COLORS.textMuted}
            value={address}
            onChangeText={setAddress}
            multiline
          />
        </View>

        <View style={styles.photoSection}>
          <View style={styles.photoSectionHeader}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
            <Text style={styles.photoSectionTitle}>Xác minh danh tính</Text>
          </View>
          <Text style={styles.photoSectionDesc}>
            Cung cấp ảnh CCCD và ảnh chân dung để Admin xét duyệt yêu cầu nâng cấp.
          </Text>
          {renderImagePicker('📋 Mặt trước CCCD *', idCardFront, setIdCardFront)}
          {renderImagePicker('📋 Mặt sau CCCD *', idCardBack, setIdCardBack)}
          {renderImagePicker('📸 Ảnh chân dung *', selfiePhoto, setSelfiePhoto)}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={18} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Sau khi Admin duyệt, bạn sẽ có thể đăng nhập với 2 vai trò: Phụ huynh (đăng việc) và Carepartner (nhận việc). Chuyển đổi vai trò từ menu hồ sơ.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="rocket" size={18} color="#fff" />
              <Text style={styles.submitText}>Gửi yêu cầu nâng cấp</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.primary,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: SIZES.radiusSm,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { ...TYPO.h4, color: '#fff', fontWeight: '800' },
  body: { flex: 1, padding: SIZES.md },
  introCard: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd, padding: 20,
    alignItems: 'center', gap: 10, marginBottom: 20, ...SHADOWS.cardHover,
  },
  introIconCircle: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  introTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '700' },
  introDesc: { ...TYPO.bodySmall, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  label: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 6, marginTop: 12 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm, borderWidth: 1.5,
    borderColor: COLORS.border, paddingHorizontal: 14, minHeight: 50,
    ...SHADOWS.small,
  },
  input: { flex: 1, ...TYPO.body, color: COLORS.textPrimary, paddingVertical: 8 },
  photoSection: {
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 16, gap: 12, marginTop: 20, marginBottom: 16,
    borderWidth: 1.5, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  photoSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photoSectionTitle: { ...TYPO.h4, color: COLORS.textPrimary },
  photoSectionDesc: { ...TYPO.bodySmall, color: COLORS.textMuted, lineHeight: 20 },
  imagePicker: { gap: 6 },
  imageLabel: { ...TYPO.h5, fontSize: 13, color: COLORS.textSecondary },
  imageActions: { flexDirection: 'row', gap: 10 },
  imageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm, paddingVertical: 12,
    borderWidth: 1.5, borderColor: COLORS.primarySoft, borderStyle: 'dashed',
  },
  imageBtnText: { ...TYPO.buttonSmall, color: COLORS.primary },
  imagePreview: {
    width: '100%', height: 120, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.background,
  },
  imageOverlay: {
    position: 'absolute', bottom: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  imageOverlayText: { ...TYPO.overline, color: '#fff' },
  infoBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  infoText: { flex: 1, ...TYPO.bodySmall, color: COLORS.primaryDark, lineHeight: 20 },
  footer: { padding: 20, paddingBottom: 36, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 54,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
    ...SHADOWS.large,
  },
  submitText: { color: '#fff', ...TYPO.button, fontSize: 16 },
});
