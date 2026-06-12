import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert, ActivityIndicator, TextInput, Animated } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { createReview } from '../../api/tasks';
import { COLORS, SHADOWS, SIZES, TYPO, ANIM, FRAGMENTS } from '../../theme/colors';

export default function ReviewScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { taskId, revieweeId } = route.params || {};
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [commentFocused, setCommentFocused] = useState(false);

  // Animated scale for star press effect
  const starScales = useRef([1, 1, 1, 1, 1].map(() => new Animated.Value(1))).current;

  const handleStarPress = (star) => {
    setRating(star);
    // Scale bounce effect on the pressed star
    Animated.sequence([
      Animated.timing(starScales[star - 1], { toValue: 1.3, duration: ANIM.timingFast, useNativeDriver: true }),
      Animated.spring(starScales[star - 1], { toValue: 1, tension: 60, friction: 5, useNativeDriver: true }),
    ]).start();
  };

  const handleSubmit = async () => {
    if (!comment.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng để lại nhận xét của bạn.');
      return;
    }
    setIsLoading(true);
    try {
      await createReview({ task: taskId, rating, comment });
      Alert.alert('✅ Cảm ơn!', 'Đánh giá của bạn đã được ghi nhận.', [
        { text: 'OK', onPress: () => navigation.popToTop() }
      ]);
    } catch (e) {
      Alert.alert('Lỗi', e.response?.data?.detail || 'Gửi đánh giá thất bại.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="close" size={22} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đánh giá Carepartner</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.heroBox}>
          <Text style={styles.heroEmoji}>⭐</Text>
          <Text style={styles.heroTitle}>Công việc hoàn thành!</Text>
          <Text style={styles.heroSub}>Hãy đánh giá trải nghiệm của bạn</Text>
        </View>

        {/* Rating stars */}
        <Text style={styles.label}>Đánh giá sao</Text>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map(star => (
            <TouchableOpacity key={star} onPress={() => handleStarPress(star)} activeOpacity={0.7}>
              <Animated.View style={{ transform: [{ scale: starScales[star - 1] }] }}>
                <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={40} color={star <= rating ? COLORS.warning : COLORS.border} />
              </Animated.View>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.ratingLabel}>{['', 'Rất tệ', 'Tệ', 'Ổn', 'Tốt', 'Xuất sắc'][rating]}</Text>

        {/* Comment */}
        <Text style={styles.label}>Nhận xét của bạn</Text>
        <TextInput
          style={[styles.textarea, commentFocused && styles.textareaFocused]}
          placeholder="Chia sẻ trải nghiệm thực tế của bạn về Carepartner này..."
          placeholderTextColor={COLORS.textMuted}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
          onFocus={() => setCommentFocused(true)}
          onBlur={() => setCommentFocused(false)}
        />

        <TouchableOpacity style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
          onPress={handleSubmit} disabled={isLoading} activeOpacity={0.85}>
          {isLoading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={18} color="#fff" />
              <Text style={styles.submitText}>Gửi đánh giá</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZES.md, paddingTop: 56, paddingBottom: 16, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border, ...SHADOWS.small },
  backBtn: { width: 40, height: 40, borderRadius: SIZES.radiusSm, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...TYPO.h4, color: COLORS.textPrimary, fontWeight: '800' },
  body: { flex: 1, padding: SIZES.lg, gap: SIZES.md },
  heroBox: { backgroundColor: COLORS.primaryLight, borderRadius: SIZES.radiusLg, padding: SIZES.lg, alignItems: 'center', gap: SIZES.sm, borderWidth: 1.5, borderColor: COLORS.primarySoft, ...SHADOWS.small },
  heroEmoji: { fontSize: 48 },
  heroTitle: { ...TYPO.h2, color: COLORS.primaryDark },
  heroSub: { ...TYPO.body, color: COLORS.primary },
  label: { ...TYPO.overline, color: COLORS.textSecondary },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: SIZES.sm },
  ratingLabel: { textAlign: 'center', ...TYPO.bodyLarge, color: COLORS.warning, fontWeight: '700' },
  textarea: { backgroundColor: COLORS.surface, borderRadius: SIZES.radiusSm, borderWidth: 1.5, borderColor: COLORS.border, padding: SIZES.md, ...TYPO.body, color: COLORS.textPrimary, minHeight: 120 },
  textareaFocused: { ...FRAGMENTS.inputFocus, ...SHADOWS.inputFocus },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: SIZES.radiusMd, height: 54, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, ...SHADOWS.large, marginTop: SIZES.sm },
  submitText: { color: '#fff', ...TYPO.button },
});
