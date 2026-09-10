import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Alert, Platform, Modal } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getTaskDetail, getMyJobsAsWorker } from '../../api/tasks';
import { getTaskModeration } from '../../api/moderation';
import { COLORS, SHADOWS, SIZES, TYPO, FRAGMENTS } from '../../theme/colors';
import { CATEGORY_ICONS, renderCategoryIcon, getCategoryIconByName } from '../../theme/categoryIcons';

// QA 2026-09-10 #1: chỉ 3 danh mục chuẩn
const CATEGORIES = [
  { id: 1, name: 'Gia sư', color: COLORS.primary, bg: COLORS.primaryLight },
  { id: 2, name: 'Đón trẻ', color: COLORS.primary, bg: COLORS.primaryLight },
  { id: 4, name: 'Trông trẻ', color: COLORS.primary, bg: COLORS.primaryLight },
];

export default function TaskDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId } = route.params || {};
  const [task, setTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  // WIRING FIX (2026-08-21): moderation info
  const [moderationInfo, setModerationInfo] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Sử dụng endpoint chi tiết task thay vì fetch ALL tasks
        const taskRes = await getTaskDetail(taskId);
        setTask(taskRes.data);

        // Kiểm tra xem carepartner đã ứng tuyển việc này chưa
        const jobsRes = await getMyJobsAsWorker();
        const alreadyApplied = jobsRes.data.some(job => job.task === taskId);
        setHasApplied(alreadyApplied);

        // WIRING FIX (2026-08-21): Fetch moderation info nếu task bị từ chối/chờ review
        if (taskRes.data.moderation_status && taskRes.data.moderation_status !== 'approved') {
          try {
            const modRes = await getTaskModeration(taskId);
            setModerationInfo(modRes.data);
          } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [taskId]);

  if (isLoading) return <ActivityIndicator color={COLORS.primary} style={{ flex: 1, marginTop: 100 }} />;
  if (!task) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: COLORS.textMuted }}>Không tìm thấy công việc này.</Text>
    </View>
  );

  const cat = CATEGORIES.find(c => c.id === task.category) || CATEGORIES[0];

  const INFO_ITEMS = [
    { icon: 'calendar-outline', label: 'Thời gian', value: new Date(task.scheduled_time).toLocaleString('vi-VN'), color: COLORS.primary },
    { icon: 'location-outline', label: 'Địa điểm', value: task.location, color: COLORS.primary },
    { icon: 'person-outline', label: 'Phụ huynh', value: task.parent_name, color: COLORS.primary },
    { icon: 'cash-outline', label: 'Thù lao', value: `${parseInt(task.price).toLocaleString('vi-VN')}đ`, color: COLORS.primary },
  ];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết công việc</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {/* WIRING FIX (2026-08-21): Banner kiểm duyệt AI */}
        {moderationInfo && moderationInfo.status !== 'approved' ? (
          <View style={styles.moderationBanner}>
            <Ionicons name="shield-outline" size={18} color={COLORS.warning} />
            <Text style={styles.moderationText}>
              {moderationInfo.status === 'rejected'
                ? 'Việc này không vượt qua kiểm duyệt tự động. Lý do: ' + (moderationInfo.ai_verdict || 'Nội dung không phù hợp')
                : 'Việc này đang chờ Admin xem xét lại.'}
            </Text>
          </View>
        ) : null}

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.categoryTag}>
            {renderCategoryIcon(cat.id, 18, '#fff')}
            <Text style={styles.categoryTagText}>{cat.name}</Text>
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <Text style={styles.price}>{parseInt(task.price).toLocaleString('vi-VN')}đ</Text>
        </View>

        {/* Thông tin */}
        <View style={styles.infoGrid}>
          {INFO_ITEMS.map((item) => (
            <View key={item.label} style={styles.infoCard}>
              <View style={styles.infoIconCircle}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={[styles.infoValue, item.label === 'Thù lao' && { color: COLORS.success, fontWeight: '900' }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Mô tả */}
        <View style={styles.descSection}>
          <Text style={styles.descTitle}>Yêu cầu chi tiết</Text>
          <Text style={styles.descText}>{task.description}</Text>
        </View>
      </ScrollView>

      {/* Bottom CTA — QA 2026-09-10 #2: luồng thụ động kiểu Grab.
          Carepartner KHÔNG tự ứng tuyển nữa: phụ huynh chọn từ 8 ứng viên
          AI đề xuất, đơn tự xuất hiện ở MyBookingsScreen chờ cam kết. */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.applyBtn}
          onPress={() => navigation.navigate('MyBookings')}
          activeOpacity={0.85}
        >
          <Ionicons name="notifications" size={20} color="#fff" />
          <Text style={styles.applyBtnText}>XEM ĐƠN ĐƯỢC GIAO</Text>
        </TouchableOpacity>
      </View>

      {/* ===== CONSENT MODAL (cho tracking) ===== */}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surfaceAlt, justifyContent: 'center', alignItems: 'center',
    ...SHADOWS.small,
  },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  body: { flex: 1 },
  // === MODERATION BANNER ===
  moderationBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningBg,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  moderationText: {
    flex: 1,
    ...TYPO.bodySmall,
    color: COLORS.warning,
    lineHeight: 20,
    fontWeight: '600',
  },
  // === HERO ===
  hero: {
    backgroundColor: COLORS.surfaceAlt, padding: 24,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    borderRadius: SIZES.radiusSm, paddingHorizontal: 12, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primaryLight,
    ...SHADOWS.small,
  },
  catImage: { width: 16, height: 16 },
  categoryTagText: { ...TYPO.caption, color: COLORS.primary },
  title: { ...TYPO.h2, color: COLORS.textPrimary },
  price: { ...TYPO.h1, fontSize: 28, color: COLORS.primary },
  // === INFO GRID ===
  infoGrid: { padding: SIZES.md, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  infoCard: {
    width: '47%', backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 14, gap: 8,
    ...SHADOWS.cardHover,
  },
  infoIconCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
  },
  infoLabel: { ...TYPO.overline, color: COLORS.textMuted },
  infoValue: { ...TYPO.bodySmall, color: COLORS.textPrimary, fontWeight: '700' },
  // === DESCRIPTION ===
  descSection: {
    margin: SIZES.md, backgroundColor: COLORS.surface, borderRadius: SIZES.radiusMd,
    padding: 18, gap: 10,
    ...SHADOWS.small,
    borderLeftWidth: 3, borderLeftColor: COLORS.primary,
  },
  descTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '900' },
  descText: { ...TYPO.body, color: COLORS.textSecondary },
  // === FOOTER ===
  footer: {
    padding: 20, paddingBottom: 36,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  applyBtn: {
    backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 56,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12,
    ...SHADOWS.large,
  },
  applyBtnDisabled: {
    backgroundColor: COLORS.textMuted, opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  applyBtnText: { color: '#fff', ...TYPO.button, letterSpacing: 0.5 },

  // === CONSENT MODAL ===
  consentOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  consentSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl,
    padding: 24, paddingBottom: 36,
    ...SHADOWS.large,
  },
  consentHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.divider,
    alignSelf: 'center', marginBottom: 16,
  },
  consentIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 2, borderColor: COLORS.primarySoft,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'center', marginBottom: 16,
  },
  consentTitle: {
    ...TYPO.h3, fontSize: 20, color: COLORS.textPrimary,
    textAlign: 'center', marginBottom: 8, fontWeight: '700',
  },
  consentDesc: {
    ...TYPO.body, color: COLORS.textSecondary,
    textAlign: 'center', lineHeight: 22,
    marginBottom: 20, paddingHorizontal: 8,
  },
  consentFeaturesCard: {
    backgroundColor: COLORS.background,
    borderRadius: 14, padding: 14, marginBottom: 12, gap: 10,
  },
  consentFeatureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  consentFeatureIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  consentFeatureText: {
    ...TYPO.bodySmall, color: COLORS.textPrimary, flex: 1,
  },
  consentWarningBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: COLORS.warningBg, borderRadius: 10, padding: 10,
    marginBottom: 16, borderWidth: 1, borderColor: '#fde68a',
  },
  consentWarningText: {
    flex: 1, ...TYPO.caption, color: COLORS.warning, lineHeight: 18, fontWeight: '600',
  },
  consentBtnRow: {
    flexDirection: 'row', gap: 10,
  },
  consentBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  consentBtnPrimary: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.large,
  },
  consentBtnSecondary: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  consentBtnPrimaryText: {
    color: '#fff', ...TYPO.button, fontSize: 14,
  },
  consentBtnSecondaryText: {
    color: COLORS.textSecondary, ...TYPO.button, fontSize: 14,
  },
});
