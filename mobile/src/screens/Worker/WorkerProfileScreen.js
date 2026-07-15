import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Alert, Platform, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { updateCertificate } from '../../api/auth';
import { submitCredential, requestProfileChange } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';
import NotificationBell from '../../components/NotificationBell';

export default function WorkerProfileScreen() {
  const { user, logout } = useAuth();
  const navigation = useNavigation();
  const [isUploading, setIsUploading] = React.useState(false);

  // Modal states cho Submit Credential
  const [credModalVisible, setCredModalVisible] = React.useState(false);
  const [credPhoto, setCredPhoto] = React.useState(null);
  const [credDesc, setCredDesc] = React.useState('');
  const [credSubmitting, setCredSubmitting] = React.useState(false);

  // Modal states cho Profile Change Request
  const [changeModalVisible, setChangeModalVisible] = React.useState(false);
  const [changeForm, setChangeForm] = React.useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone_number: user?.phone_number || '',
    email: user?.email || '',
    address: user?.address || '',
  });
  const [changeSubmitting, setChangeSubmitting] = React.useState(false);

  const displayName = user?.first_name
    ? `${user.first_name} ${user.last_name || ''}`.trim()
    : user?.username || 'Sinh viên';

  const MENU_ITEMS = [
    { icon: 'star-outline', label: 'Xem đánh giá từ phụ huynh', color: COLORS.primary, action: 'view_reviews' },
    { icon: 'wallet-outline', label: 'Thu nhập của tôi', color: COLORS.success, action: 'view_earnings' },
    { icon: 'ribbon-outline', label: 'Gửi bằng cấp mới', color: COLORS.primary, action: 'submit_credential' },
    { icon: 'documents-outline', label: 'Khiếu nại của tôi', color: COLORS.error, action: 'view_my_complaints' },
    { icon: 'create-outline', label: 'Yêu cầu sửa hồ sơ', color: COLORS.primary, action: 'request_change' },
    { icon: 'help-circle-outline', label: 'Trung tâm hỗ trợ', color: COLORS.info, action: 'help_center' },
    { icon: 'card-outline', label: 'Xác thực thẻ sinh viên / bằng cấp', color: COLORS.primary, action: 'upload_cert' },
    { icon: 'shield-checkmark-outline', label: 'Chính sách bảo mật', color: COLORS.primary },
  ];

  const pickCredPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Quyền truy cập bị từ chối', 'Cần quyền truy cập thư viện ảnh.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      setCredPhoto(result.assets[0]);
    }
  };

  const handleSubmitCredential = async () => {
    if (!credPhoto) {
      Alert.alert('Thiếu ảnh', 'Vui lòng chọn ảnh bằng cấp.');
      return;
    }
    setCredSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('certificate_photo', {
        uri: credPhoto.uri,
        type: credPhoto.mimeType || 'image/jpeg',
        name: 'credential.jpg',
      });
      if (credDesc.trim()) formData.append('description', credDesc.trim());

      await submitCredential(formData);
      Alert.alert('✅ Thành công', 'Đã gửi bằng cấp. Admin sẽ xem xét sớm!');
      setCredModalVisible(false);
      setCredPhoto(null);
      setCredDesc('');
    } catch (e) {
      const msg = e.response?.data?.error || 'Gửi thất bại.';
      Alert.alert('Lỗi', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setCredSubmitting(false);
    }
  };

  const handleRequestChange = async () => {
    setChangeSubmitting(true);
    try {
      const changes = {};
      Object.keys(changeForm).forEach(key => {
        const newVal = (changeForm[key] || '').trim();
        const oldVal = (user?.[key] || '').trim();
        if (newVal && newVal !== oldVal) changes[key] = newVal;
      });
      if (Object.keys(changes).length === 0) {
        Alert.alert('Không có thay đổi', 'Bạn chưa sửa thông tin nào.');
        setChangeSubmitting(false);
        return;
      }
      await requestProfileChange(changes);
      Alert.alert('✅ Đã gửi', 'Yêu cầu thay đổi hồ sơ đã gửi. Admin sẽ duyệt trong 1-2 ngày.');
      setChangeModalVisible(false);
    } catch (e) {
      const msg = e.response?.data?.error || 'Gửi yêu cầu thất bại.';
      Alert.alert('Lỗi', typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setChangeSubmitting(false);
    }
  };

  const handleMenuPress = async (action) => {
    if (action === 'view_reviews') {
      navigation.navigate('CandidateProfile', { workerId: user.id, isPending: false });
    } else if (action === 'view_earnings') {
      navigation.navigate('MyEarnings');
    } else if (action === 'view_my_complaints') {
      navigation.navigate('MyComplaints');
    } else if (action === 'help_center') {
      navigation.navigate('HelpCenter');
    } else if (action === 'submit_credential') {
      setCredModalVisible(true);
    } else if (action === 'request_change') {
      setChangeForm({
        first_name: user?.first_name || '',
        last_name: user?.last_name || '',
        phone_number: user?.phone_number || '',
        email: user?.email || '',
        address: user?.address || '',
      });
      setChangeModalVisible(true);
    } else if (action === 'upload_cert') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Quyền truy cập bị từ chối', 'Ứng dụng cần quyền truy cập thư viện ảnh để tải lên.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, quality: 0.8,
      });

      if (!result.canceled) {
        setIsUploading(true);
        try {
          const photo = {
            uri: result.assets[0].uri,
            type: result.assets[0].mimeType || 'image/jpeg',
            name: 'certificate.jpg',
          };
          await updateCertificate(photo);
          Alert.alert('Thành công', 'Đã tải lên minh chứng thành công. Admin sẽ xem xét sớm nhất!');
        } catch (error) {
          console.error("Upload error:", error?.response?.data || error);
          Alert.alert('Lỗi', 'Không thể tải lên. Vui lòng thử lại.');
        } finally {
          setIsUploading(false);
        }
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header cam */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={{ width: 40 }} />
            <Text style={styles.headerTitle}>Hồ sơ</Text>
            <NotificationBell color="rgba(255,255,255,0.9)" />
          </View>
          {/* Decorative circles */}
          <View style={styles.headerDeco1} />
          <View style={styles.headerDeco2} />
          <View style={styles.headerDeco3} />
          <View style={styles.avatarRing}>
            <View style={styles.avatarGlow} />
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName?.[0]?.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.username}>@{user?.username}</Text>
          {/* Verified badge */}
          {user?.is_verified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#fff" />
              <Text style={styles.verifiedText}>Đã xác thực</Text>
            </View>
          ) : (
            <View style={[styles.verifiedBadge, styles.unverifiedBadge]}>
              <Ionicons name="shield-outline" size={14} color={COLORS.warning} />
              <Text style={[styles.verifiedText, { color: COLORS.warning }]}>Chưa xác thực</Text>
            </View>
          )}
        </View>

        {/* AI Summary */}
        {user?.ai_profile_summary && (
          <View style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <View style={styles.aiIconCircle}>
                <Ionicons name="sparkles" size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.aiTitle}>Nhận xét từ AI</Text>
            </View>
            <Text style={styles.aiText}>{user.ai_profile_summary}</Text>
          </View>
        )}

        {/* Thông tin */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thông tin cá nhân</Text>
          <View style={styles.infoList}>
            {[
              { icon: 'mail-outline', label: 'Email', value: user?.email || 'Chưa cập nhật', color: COLORS.primary },
              { icon: 'call-outline', label: 'Số điện thoại', value: user?.phone_number || 'Chưa cập nhật', color: COLORS.primary },
              { icon: 'location-outline', label: 'Địa chỉ', value: user?.address || 'Chưa cập nhật', color: COLORS.primary },
            ].map(item => (
              <View key={item.label} style={styles.infoItem}>
                <View style={[styles.infoIconCircle, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>{item.label}</Text>
                  <Text style={styles.infoValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Bằng cấp & Chứng chỉ */}
        {user?.qualifications && user.qualifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bằng cấp & Chứng chỉ</Text>
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
              {user.qualifications.map((q, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="ribbon-outline" size={18} color={COLORS.primary} />
                  <Text style={{ ...TYPO.body, color: COLORS.textPrimary }}>{q}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Menu Actions */}
        <View style={styles.section}>
          {MENU_ITEMS.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.actionRow, index === MENU_ITEMS.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => item.action && handleMenuPress(item.action)}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIconCircle, { backgroundColor: item.color + '15' }]}>
                {isUploading && item.action === 'upload_cert' ? (
                  <ActivityIndicator size="small" color={item.color} />
                ) : (
                  <Ionicons name={item.icon} size={20} color={item.color} />
                )}
              </View>
              <Text style={styles.actionText}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.logoutRow}
            onPress={() => {
              if (Platform.OS === 'web') {
                if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                  logout();
                }
              } else {
                Alert.alert('Đăng xuất', 'Bạn có chắc chắn muốn đăng xuất?', [
                  { text: 'Huỷ', style: 'cancel' },
                  { text: 'Đăng xuất', style: 'destructive', onPress: logout }
                ]);
              }
            }}>
            <View style={[styles.actionIconCircle, { backgroundColor: COLORS.errorBg }]}>
              <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
            </View>
            <Text style={[styles.actionText, { color: COLORS.error }]}>Đăng xuất</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal: Submit Credential */}
      <Modal visible={credModalVisible} animationType="slide" transparent={true} onRequestClose={() => setCredModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Gửi bằng cấp mới</Text>
              <TouchableOpacity onPress={() => setCredModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Ảnh bằng cấp/chứng chỉ *</Text>
            {credPhoto ? (
              <TouchableOpacity onPress={pickCredPhoto} activeOpacity={0.8}>
                <Image source={{ uri: credPhoto.uri }} style={styles.credImagePreview} />
                <Text style={styles.changePhotoText}>Chạm để đổi ảnh</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.uploadBtn} onPress={pickCredPhoto} activeOpacity={0.85}>
                <Ionicons name="cloud-upload-outline" size={28} color={COLORS.primary} />
                <Text style={styles.uploadBtnText}>Chọn ảnh từ thư viện</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.modalLabel}>Mô tả (tuỳ chọn)</Text>
            <TextInput
              style={styles.modalTextarea}
              placeholder="VD: Bằng cử nhân Sư phạm Toán, chứng chỉ IELTS 7.5..."
              placeholderTextColor={COLORS.textMuted}
              value={credDesc}
              onChangeText={setCredDesc}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.modalSubmitBtn, credSubmitting && { opacity: 0.7 }]}
              onPress={handleSubmitCredential}
              disabled={credSubmitting}
              activeOpacity={0.85}
            >
              {credSubmitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.modalSubmitText}>Gửi cho Admin duyệt</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: Profile Change Request */}
      <Modal visible={changeModalVisible} animationType="slide" transparent={true} onRequestClose={() => setChangeModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yêu cầu sửa hồ sơ</Text>
              <TouchableOpacity onPress={() => setChangeModalVisible(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Họ</Text>
            <TextInput style={styles.modalInput} value={changeForm.last_name}
              onChangeText={(v) => setChangeForm({...changeForm, last_name: v})}
              placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.modalLabel}>Tên</Text>
            <TextInput style={styles.modalInput} value={changeForm.first_name}
              onChangeText={(v) => setChangeForm({...changeForm, first_name: v})}
              placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.modalLabel}>Số điện thoại</Text>
            <TextInput style={styles.modalInput} value={changeForm.phone_number}
              onChangeText={(v) => setChangeForm({...changeForm, phone_number: v})}
              keyboardType="phone-pad" placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.modalLabel}>Email</Text>
            <TextInput style={styles.modalInput} value={changeForm.email}
              onChangeText={(v) => setChangeForm({...changeForm, email: v})}
              keyboardType="email-address" autoCapitalize="none"
              placeholderTextColor={COLORS.textMuted} />

            <Text style={styles.modalLabel}>Địa chỉ</Text>
            <TextInput style={styles.modalInput} value={changeForm.address}
              onChangeText={(v) => setChangeForm({...changeForm, address: v})}
              multiline placeholderTextColor={COLORS.textMuted} />

            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
              <Text style={styles.infoBoxText}>Yêu cầu sẽ được Admin duyệt trong 1-2 ngày. Bạn vẫn dùng thông tin cũ cho đến khi được duyệt.</Text>
            </View>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, changeSubmitting && { opacity: 0.7 }]}
              onPress={handleRequestChange}
              disabled={changeSubmitting}
              activeOpacity={0.85}
            >
              {changeSubmitting ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.modalSubmitText}>Gửi yêu cầu</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // === HEADER ===
  header: {
    alignItems: 'center', paddingTop: 16, paddingBottom: 32,
    backgroundColor: COLORS.primary, gap: 6,
    borderBottomLeftRadius: SIZES.radiusXl, borderBottomRightRadius: SIZES.radiusXl,
    overflow: 'hidden',
    position: 'relative',
  },
  headerTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 16, width: '100%',
  },
  headerTitle: { ...TYPO.h5, color: '#fff', fontWeight: '700' },
  headerDeco1: {
    position: 'absolute', top: -40, right: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerDeco2: {
    position: 'absolute', bottom: -20, left: -30,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerDeco3: {
    position: 'absolute', top: 30, right: 90,
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    position: 'relative',
  },
  avatarGlow: {
    position: 'absolute', top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 54,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  avatar: {
    width: 82, height: 82, borderRadius: 41,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', ...TYPO.h1, fontSize: 34 },
  name: { ...TYPO.h2, color: '#fff' },
  username: { ...TYPO.bodySmall, color: 'rgba(255,255,255,0.7)' },
  verifiedBadge: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: SIZES.radiusXl,
    paddingHorizontal: 14, paddingVertical: 6, marginTop: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  unverifiedBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  verifiedText: { ...TYPO.caption, color: '#fff' },
  // === AI ===
  aiCard: {
    margin: SIZES.md, backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd,
    padding: 16, gap: 10, borderWidth: 1, borderColor: COLORS.primarySoft,
    ...SHADOWS.small,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  aiHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  aiIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
    ...SHADOWS.small,
  },
  aiImage: { width: '100%', height: '100%' },
  aiTitle: { ...TYPO.h5, color: COLORS.primary },
  aiText: { ...TYPO.body, color: COLORS.textSecondary },
  // === SECTIONS ===
  section: {
    margin: SIZES.md, marginTop: 0, marginBottom: 12,
    backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    ...SHADOWS.cardHover,
  },
  sectionTitle: {
    ...TYPO.overline, color: COLORS.textMuted,
    padding: 16, paddingBottom: 8,
  },
  infoList: { paddingHorizontal: 16, paddingBottom: 8 },
  infoItem: {
    flexDirection: 'row', gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center',
  },
  infoIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  infoText: { flex: 1 },
  infoLabel: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 2 },
  infoValue: { ...TYPO.h5, color: COLORS.textPrimary, fontWeight: '600' },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  actionIconCircle: {
    width: 38, height: 38, borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
  },
  actionText: { flex: 1, ...TYPO.bodyLarge, color: COLORS.textPrimary },
  logoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16,
    backgroundColor: COLORS.errorBg + '40',
    borderRadius: SIZES.radiusMd,
    margin: SIZES.xs,
    ...SHADOWS.small,
  },
  // === MODAL ===
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl,
    padding: 20, paddingBottom: 36, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
  },
  modalLabel: { ...TYPO.overline, color: COLORS.textMuted, marginBottom: 6, marginTop: 12 },
  modalInput: {
    backgroundColor: COLORS.background, borderRadius: SIZES.radiusSm, borderWidth: 1.5,
    borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10,
    ...TYPO.body, color: COLORS.textPrimary,
  },
  modalTextarea: {
    backgroundColor: COLORS.background, borderRadius: SIZES.radiusSm, borderWidth: 1.5,
    borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10,
    ...TYPO.body, color: COLORS.textPrimary, minHeight: 80,
  },
  uploadBtn: {
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusMd,
    padding: 24, alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: COLORS.primarySoft, borderStyle: 'dashed',
  },
  uploadBtnText: { ...TYPO.bodySmall, color: COLORS.primary, fontWeight: '600' },
  credImagePreview: {
    width: '100%', height: 180, borderRadius: SIZES.radiusMd, backgroundColor: COLORS.background,
  },
  changePhotoText: { ...TYPO.caption, color: COLORS.primary, textAlign: 'center', marginTop: 6 },
  infoBox: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusSm, padding: 10,
    marginTop: 12, borderWidth: 1, borderColor: COLORS.primarySoft,
  },
  infoBoxText: { flex: 1, ...TYPO.caption, color: COLORS.primaryDark, lineHeight: 18 },
  modalSubmitBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 50,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
    marginTop: 20,
    ...SHADOWS.large,
  },
  modalSubmitText: { color: '#fff', ...TYPO.button, fontSize: 15 },
});
