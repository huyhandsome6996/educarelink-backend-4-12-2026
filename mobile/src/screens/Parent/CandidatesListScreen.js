// ============================================================
// CandidatesListScreen — Redesign theo Google Stitch AI
// "Danh sách ứng viên CarePartner tuyển chọn - EduCareLink"
//
// Tính năng:
// 1. Sticky Top Bar: Nút quay lại + Pill "EduCareLink Guarantee"
// 2. Job Context Capsule: Loại dịch vụ, học phí/h, tiêu đề, lịch học & địa chỉ
// 3. Algorithm Live Status: Radar xanh ngọc pulsing, đếm CarePartner rảnh lịch
// 4. Filter & Sort Pills: Điểm phù hợp nhất, Gần nhà nhất, Đánh giá cao nhất, Chỉ xem Nữ
// 5. #1 Spotlight Hero Card: Vương miện "GỢI Ý HÀNG ĐẦU · 96/100", verified badges,
//    quote đánh giá từ phụ huynh thực tế, CTA "Chọn CarePartner này →"
// 6. Standard Cards (#2 - #8): Badge thứ hạng (#2, #3...), điểm số cam đậm,
//    khoảng cách, số đơn hoàn thành, tags kỹ năng, nút "Xem hồ sơ" & "Chọn bạn này"
// 7. Safety Guarantee Box: Cam kết MoMo Escrow & Bảo hiểm đổi ứng viên 100%
// 8. Confirmation Modal: Popup xác nhận đặt lịch kèm tóm tắt chi phí & chính sách
// 9. Graceful Demo Fallback: Luôn có dữ liệu phong phú để test ngay cả khi chưa có đơn
// ============================================================

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Modal,
  ScrollView,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, SIZES, TYPO } from '../../theme/colors';
import { getMatchingCandidates, selectCarePartner, MATCH_LEVEL_LABELS } from '../../api/matching';

// Bộ màu avatar sinh viên
const AVATAR_COLORS = [
  '#F26522', // Signature Orange
  '#2563EB', // Royal Blue
  '#0E9F6E', // Emerald Green
  '#D97706', // Amber Gold
  '#7C3AED', // Purple
  '#EC4899', // Pink
  '#0D9488', // Teal
  '#4F46E5', // Indigo
];

// Dữ liệu mẫu chuẩn Google Stitch khi chưa có job_id cụ thể hoặc đang duyệt demo
const DEMO_JOB = {
  title: 'Gia sư Toán & Tiếng Anh kèm bé lớp 4',
  category_label: 'Gia sư & Kèm học 1:1',
  category_icon: 'school',
  hourly_rate_vnd: 120000,
  schedule: '18:00 - 20:00 (Thứ 2, 4, 6)',
  location_note: 'Cách bạn 1.2 km (Quận Cầu Giấy, Hà Nội)',
};

const DEMO_CANDIDATES = [
  {
    carepartner_id: 'cp-8824',
    display_name: 'Nguyễn Thu Hà',
    gender: 'female',
    school: 'ĐH Sư Phạm Hà Nội',
    major: 'Sư phạm Giáo dục Tiểu học',
    match_level: 'very_high',
    match_level_vi: 'Rất phù hợp',
    match_score: 96,
    rating: 4.95,
    completed_jobs: 48,
    distance_km: 1.2,
    top_skills: ['Luyện chữ đẹp', 'Tiểu học', 'Kiên nhẫn', 'Sư phạm'],
    latest_review: 'Cô giáo dạy luyện chữ cực kỳ kiên nhẫn và ân cần. Sau 10 buổi nét chữ bé tiến bộ vượt bậc, tròn và đều tăm tắp!',
    response_tag: 'Phản hồi < 5 phút',
  },
  {
    carepartner_id: 'cp-7102',
    display_name: 'Đỗ Hoàng Ngân',
    gender: 'female',
    school: 'ĐH Sư Phạm Hà Nội',
    major: 'Giáo dục Mầm non',
    match_level: 'very_high',
    match_level_vi: 'Rất phù hợp',
    match_score: 95,
    rating: 5.0,
    completed_jobs: 38,
    distance_km: 1.4,
    top_skills: ['Trông trẻ', 'Mầm non', 'Montessori', 'Sơ cấp cứu'],
    latest_review: 'Cô Ngân trông bé rất khéo và chu đáo, bé quấn cô như người nhà. Gia đình hoàn toàn yên tâm gửi gắm.',
    response_tag: 'Phản hồi < 3 phút',
  },
  {
    carepartner_id: 'cp-6531',
    display_name: 'Lê Thảo Vy',
    gender: 'female',
    school: 'ĐH Sư Phạm Hà Nội',
    major: 'Sư phạm Ngữ Văn & Tiểu học',
    match_level: 'very_high',
    match_level_vi: 'Rất phù hợp',
    match_score: 93,
    rating: 4.9,
    completed_jobs: 35,
    distance_km: 1.8,
    top_skills: ['Luyện chữ đẹp', 'Ngữ văn', 'Rèn chữ', 'Kiên nhẫn'],
    latest_review: 'Phương pháp rèn chữ chuẩn nét thanh nét đậm, tư thế ngồi và cách cầm bút chuẩn y khoa.',
    response_tag: 'Phản hồi < 5 phút',
  },
  {
    carepartner_id: 'cp-5420',
    display_name: 'Nguyễn Hữu Phước',
    gender: 'male',
    school: 'ĐH Y Hà Nội',
    major: 'Bác sĩ Đa khoa (Năm 4)',
    match_level: 'high',
    match_level_vi: 'Phù hợp cao',
    match_score: 91,
    rating: 4.9,
    completed_jobs: 34,
    distance_km: 1.5,
    top_skills: ['Đón trẻ', 'Sơ cấp cứu', 'Lái xe an toàn', 'Đúng giờ'],
    latest_review: 'Đón bé luôn đúng giờ hẹn, lái xe cẩn thận, đội mũ bảo hiểm chỉnh tề cho con. Rất yên tâm!',
    response_tag: 'Phản hồi < 5 phút',
  },
  {
    carepartner_id: 'cp-4319',
    display_name: 'Vũ Khánh An',
    gender: 'female',
    school: 'ĐH Y Hà Nội',
    major: 'Điều dưỡng Nhi khoa (Năm 4)',
    match_level: 'high',
    match_level_vi: 'Phù hợp cao',
    match_score: 90,
    rating: 4.95,
    completed_jobs: 31,
    distance_km: 2.2,
    top_skills: ['Chăm bé sơ sinh', 'Sơ cấp cứu nhi', 'Dỗ ăn', 'Vệ sinh'],
    latest_review: 'Có kiến thức y tế nên trông trẻ rất an tâm, xử lý các tình huống quấy sốt của bé rất chuyên nghiệp.',
    response_tag: 'Phản hồi < 5 phút',
  },
  {
    carepartner_id: 'cp-3208',
    display_name: 'Trần Thị Minh Thư',
    gender: 'female',
    school: 'ĐH Ngoại Thương',
    major: 'Kinh tế Quốc tế (IELTS 8.0)',
    match_level: 'high',
    match_level_vi: 'Phù hợp cao',
    match_score: 89,
    rating: 5.0,
    completed_jobs: 32,
    distance_km: 1.6,
    top_skills: ['Tiếng Anh giao tiếp', 'Phát âm chuẩn', 'Dạy ngữ pháp'],
    latest_review: 'Phát âm chuẩn bản xứ, phương pháp truyền đạt qua trò chơi bé rất thích.',
    response_tag: 'Phản hồi < 3 phút',
  },
  {
    carepartner_id: 'cp-2197',
    display_name: 'Đỗ Đức Anh',
    gender: 'male',
    school: 'ĐH Giao Thông Vận Tải',
    major: 'Kỹ thuật Giao thông',
    match_level: 'medium',
    match_level_vi: 'Phù hợp',
    match_score: 86,
    rating: 4.88,
    completed_jobs: 25,
    distance_km: 2.0,
    top_skills: ['Đón trẻ an toàn', 'Thông thạo đường', 'Cẩn thận'],
    latest_review: 'Đức Anh rất nhiệt tình và chu đáo, luôn gọi điện báo khi đã đón được bé.',
    response_tag: 'Phản hồi < 10 phút',
  },
  {
    carepartner_id: 'cp-1086',
    display_name: 'Lê Hoàng Nam',
    gender: 'male',
    school: 'ĐH Bách Khoa Hà Nội',
    major: 'Khoa học Máy tính (Năm 4)',
    match_level: 'medium',
    match_level_vi: 'Phù hợp',
    match_score: 84,
    rating: 4.8,
    completed_jobs: 26,
    distance_km: 2.5,
    top_skills: ['Toán tư duy', 'Toán nâng cao', 'Lập trình Scratch'],
    latest_review: 'Kèm toán tư duy rất bài bản, rèn thói quen tự giác làm bài cho con.',
    response_tag: 'Phản hồi < 10 phút',
  },
];

export default function CandidatesListScreen() {
  let insets = { top: 12, bottom: 20, left: 0, right: 0 };
  try {
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch {}

  const navigation = useNavigation();
  const route = useRoute();
  const jobId = route.params?.jobId;
  const passedJob = route.params?.job;
  const passedCandidates = route.params?.candidates;
  const passedTotal = route.params?.totalMatched;
  const isDemoPreview = !jobId;
  const [jobInfo, setJobInfo] = useState(passedJob || DEMO_JOB);
  const [candidates, setCandidates] = useState(
    Array.isArray(passedCandidates)
      ? passedCandidates
      : isDemoPreview
      ? DEMO_CANDIDATES
      : []
  );
  const [totalMatched, setTotalMatched] = useState(
    typeof passedTotal === 'number'
      ? passedTotal
      : Array.isArray(passedCandidates)
      ? passedCandidates.length
      : isDemoPreview
      ? DEMO_CANDIDATES.length
      : 0
  );
  // Nếu đã nhận danh sách ứng viên được tải trước từ modal tìm kiếm -> loading = false ngay lập tức!
  const [loading, setLoading] = useState(!!jobId && !Array.isArray(passedCandidates));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Ghi nhớ cờ đã có dữ liệu prefetch để tránh load() đè spinner khi focus lần đầu
  const hasPrefetchedRef = useRef(Array.isArray(passedCandidates));

  useEffect(() => {
    if (passedJob) setJobInfo(passedJob);
    if (Array.isArray(passedCandidates)) {
      setCandidates(passedCandidates);
      setTotalMatched(typeof passedTotal === 'number' ? passedTotal : passedCandidates.length);
      setLoading(false);
      hasPrefetchedRef.current = true;
    }
  }, [passedCandidates, passedTotal, passedJob]);

  // Bộ lọc & Sắp xếp tương tác (Stitch Filter Pills)
  const [currentSort, setCurrentSort] = useState('score'); // 'score' | 'distance' | 'rating'
  const [filterFemaleOnly, setFilterFemaleOnly] = useState(false);

  // Modal xác nhận đặt lịch
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Animation radar xanh ngọc pulsing
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  // Tải danh sách ứng viên
  const load = useCallback(async (isRefresh = false) => {
    if (!jobId) {
      // Khi mở xem thử nghiệm từ trang chủ không có jobId, dùng DEMO_CANDIDATES
      setCandidates(DEMO_CANDIDATES);
      setTotalMatched(DEMO_CANDIDATES.length);
      setLoading(false);
      return;
    }

    // Nếu vừa nhận dữ liệu prefetch và không phải người dùng chủ động kéo refresh
    if (!isRefresh && hasPrefetchedRef.current) {
      hasPrefetchedRef.current = false;
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');
    try {
      const { data: res } = await getMatchingCandidates(jobId);
      if (res?.job) {
        setJobInfo((prev) => ({ ...prev, ...res.job }));
      }
      if (res?.candidates) {
        setCandidates(res.candidates);
        setTotalMatched(res.total_matched !== undefined ? res.total_matched : res.candidates.length);
      } else {
        setCandidates([]);
        setTotalMatched(0);
      }
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'slot_taken') {
        setError('Đơn vừa được chọn bởi người khác. Vui lòng làm mới.');
      } else {
        setError('Không thể tải danh sách ứng viên lúc này.');
        setCandidates([]);
        setTotalMatched(0);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Xử lý Lọc & Sắp xếp động
  const displayedCandidates = useMemo(() => {
    let list = [...candidates];

    if (filterFemaleOnly) {
      list = list.filter(
        (c) =>
          c.gender === 'female' ||
          (!c.gender &&
            (c.display_name?.includes('Thị') ||
              c.display_name?.includes('Hà') ||
              c.display_name?.includes('Thư') ||
              c.display_name?.includes('Linh') ||
              c.display_name?.includes('Trang') ||
              c.display_name?.includes('Chi')))
      );
    }

    if (currentSort === 'score') {
      list.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    } else if (currentSort === 'distance') {
      list.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
    } else if (currentSort === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return list;
  }, [candidates, currentSort, filterFemaleOnly]);

  // Lấy chữ cái đầu làm avatar
  const getInitial = (name) => {
    if (!name) return 'C';
    const parts = name.trim().split(' ');
    return parts[parts.length - 1].charAt(0).toUpperCase();
  };

  // Mở modal xác nhận đặt lịch
  const promptBooking = (cand) => {
    setSelectedCandidate(cand);
    setModalVisible(true);
  };

  // Thực thi đặt lịch
  const handleConfirmBooking = async () => {
    if (!selectedCandidate) return;

    if (!jobId) {
      // Demo mode
      setModalVisible(false);
      Alert.alert(
        'Thành công! 🎉',
        `Bạn đã chọn ${selectedCandidate.display_name}. Hệ thống sẽ chuyển tiếp đến thông tin chi tiết của CarePartner.`,
        [
          {
            text: 'Xem hồ sơ',
            onPress: () =>
              navigation.navigate('CandidateProfileV2', {
                candidate: selectedCandidate,
                jobId: 'demo-job-1',
                job: jobInfo,
              }),
          },
        ]
      );
      return;
    }

    setSubmittingBooking(true);
    try {
      const idempotencyKey = `select_${jobId}_${selectedCandidate.carepartner_id}_${Date.now()}`;
      await selectCarePartner(jobId, selectedCandidate.carepartner_id, idempotencyKey);
      setModalVisible(false);
      Alert.alert(
        'Ghép cặp thành công! 🎉',
        `Bạn đã chọn ${selectedCandidate.display_name}. Khoản ký quỹ đang được bảo vệ an toàn qua MoMo Escrow.`,
        [
          {
            text: 'Xem tiến độ ca',
            onPress: () => navigation.navigate('ParentTabs', { screen: 'ParentHome' }),
          },
        ]
      );
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Thao tác không thành công. Vui lòng thử lại.';
      Alert.alert('Thông báo', detail);
    } finally {
      setSubmittingBooking(false);
    }
  };

  // ============================================================
  // RENDER HERO CARD (#1 SPOTLIGHT - STITCH DESIGN)
  // ============================================================
  const renderHeroCard = (c) => {
    const initial = getInitial(c.display_name);
    const color = AVATAR_COLORS[0];
    const schoolMajor = [c.school, c.major].filter(Boolean).join(' · ') || 'ĐH Sư Phạm Hà Nội';
    const ratingStr = c.rating != null ? Number(c.rating).toFixed(1) : '5.0';
    const distanceStr = c.distance_km != null ? `${c.distance_km} km` : '1.2 km';
    const skills = c.top_skills && c.top_skills.length ? c.top_skills : ['Toán tiểu học', 'Kiên nhẫn', 'Giao tiếp tốt'];

    return (
      <View key={c.carepartner_id} style={styles.heroCard}>
        {/* Crown & Match Score Ribbon */}
        <View style={styles.heroRibbonRow}>
          <View style={styles.heroRibbon}>
            <Ionicons name="trophy" size={14} color="#ffffff" style={{ marginRight: 4 }} />
            <Text style={styles.heroRibbonText}>
              GỢI Ý HÀNG ĐẦU · {c.match_score}/100 ĐIỂM
            </Text>
          </View>
          <View style={styles.verifiedCheckBadge}>
            <Ionicons name="shield-checkmark" size={14} color="#0E9F6E" style={{ marginRight: 3 }} />
            <Text style={styles.verifiedCheckText}>CCCD & Thẻ SV chuẩn</Text>
          </View>
        </View>

        {/* Profile Info Main Row */}
        <TouchableOpacity
          style={styles.heroProfileRow}
          onPress={() =>
            navigation.navigate('CandidateProfileV2', {
              candidate: c,
              jobId: jobId || 'demo',
              job: jobInfo,
            })
          }
          activeOpacity={0.9}
        >
          <View style={styles.heroAvatarWrapper}>
            <View style={[styles.heroAvatar, { backgroundColor: color }]}>
              <Text style={styles.heroAvatarText}>{initial}</Text>
            </View>
            <View style={styles.heroAvatarBadge}>
              <Ionicons name="checkmark" size={11} color="#ffffff" />
            </View>
          </View>

          <View style={styles.heroInfoCol}>
            <View style={styles.heroNameRow}>
              <Text style={styles.heroName} numberOfLines={1}>
                {c.display_name}
              </Text>
              <Text style={styles.cpIdText}>#CP-{c.carepartner_id.replace('cp-', '')}</Text>
            </View>

            <View style={styles.heroSchoolRow}>
              <Ionicons name="school" size={13} color="#2563EB" style={{ marginRight: 4 }} />
              <Text style={styles.heroSchoolText} numberOfLines={1}>
                {schoolMajor}
              </Text>
            </View>

            {/* Metrics */}
            <View style={styles.heroMetricsRow}>
              <View style={styles.metricItem}>
                <Ionicons name="star" size={13} color="#F59E0B" />
                <Text style={styles.metricBold}>{ratingStr}</Text>
                <Text style={styles.metricMuted}>({c.completed_jobs} đơn)</Text>
              </View>

              <View style={styles.metricItem}>
                <Ionicons name="location" size={13} color="#F26522" />
                <Text style={styles.metricText}>{distanceStr}</Text>
              </View>

              <View style={styles.metricItem}>
                <Ionicons name="checkmark-circle" size={13} color="#0E9F6E" />
                <Text style={styles.metricGreen}>100% rảnh lịch</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Skills Chips */}
        <View style={styles.skillsRow}>
          {skills.slice(0, 4).map((skill) => (
            <View key={skill} style={styles.skillChipHero}>
              <Text style={styles.skillChipHeroText}>{skill}</Text>
            </View>
          ))}
        </View>

        {/* Verified Review Quote */}
        <View style={styles.heroReviewBox}>
          <Ionicons name="chatbubble-ellipses-outline" size={14} color="#F26522" style={{ marginRight: 6, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroReviewText}>
              "{c.latest_review || 'Gia sư dạy rất có tâm, bé nhà mình tiến bộ vượt bậc sau 1 tháng.'}"
            </Text>
            <Text style={styles.heroReviewAuthor}>— Phụ huynh đã sử dụng dịch vụ tại Cầu Giấy</Text>
          </View>
        </View>

        {/* Action Button CTA */}
        <View style={styles.heroActionRow}>
          <TouchableOpacity
            style={styles.heroBtnSecondary}
            onPress={() =>
              navigation.navigate('CandidateProfileV2', {
                candidate: c,
                jobId: jobId || 'demo',
                job: jobInfo,
              })
            }
            activeOpacity={0.8}
          >
            <Text style={styles.heroBtnSecondaryText}>Xem hồ sơ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.heroBtnPrimary}
            onPress={() => promptBooking(c)}
            activeOpacity={0.85}
          >
            <Text style={styles.heroBtnPrimaryText}>Chọn CarePartner này</Text>
            <Ionicons name="arrow-forward" size={16} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ============================================================
  // RENDER STANDARD CARD (#2 - #8)
  // ============================================================
  const renderStandardCard = (c, index) => {
    const rank = index + 1;
    const initial = getInitial(c.display_name);
    const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
    const schoolMajor = [c.school, c.major].filter(Boolean).join(' · ') || 'ĐH Quốc Gia Hà Nội';
    const ratingStr = c.rating != null ? Number(c.rating).toFixed(1) : '5.0';
    const distanceStr = c.distance_km != null ? `${c.distance_km} km` : '2.0 km';
    const skills = c.top_skills && c.top_skills.length ? c.top_skills : ['Nhiệt tình', 'Đúng giờ'];

    return (
      <View key={c.carepartner_id} style={styles.standardCard}>
        <TouchableOpacity
          style={styles.stdTopRow}
          onPress={() =>
            navigation.navigate('CandidateProfileV2', {
              candidate: c,
              jobId: jobId || 'demo',
              job: jobInfo,
            })
          }
          activeOpacity={0.9}
        >
          {/* Avatar with rank pill */}
          <View style={styles.stdAvatarWrapper}>
            <View style={[styles.stdAvatar, { backgroundColor: color }]}>
              <Text style={styles.stdAvatarText}>{initial}</Text>
            </View>
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeText}>#{rank}</Text>
            </View>
          </View>

          {/* Middle Info */}
          <View style={styles.stdInfoCol}>
            <View style={styles.stdNameRow}>
              <Text style={styles.stdName} numberOfLines={1}>
                {c.display_name}
              </Text>
              <View style={styles.stdScoreCol}>
                <Text style={styles.stdScoreNum}>{c.match_score}</Text>
                <Text style={styles.stdScoreUnit}>điểm</Text>
              </View>
            </View>

            <Text style={styles.stdSchool} numberOfLines={1}>
              {schoolMajor}
            </Text>

            <View style={styles.stdMetricsRow}>
              <View style={styles.metricItem}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.metricBoldSmall}>{ratingStr}</Text>
                <Text style={styles.metricMutedSmall}>({c.completed_jobs} đơn)</Text>
              </View>
              <Text style={styles.metricDot}>·</Text>
              <View style={styles.metricItem}>
                <Ionicons name="location" size={12} color="#F26522" />
                <Text style={styles.metricMutedSmall}>{distanceStr}</Text>
              </View>
              <Text style={styles.metricDot}>·</Text>
              <Text style={styles.stdFastTag}>⚡ {c.response_tag || 'Phản hồi nhanh'}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Skills Chips */}
        <View style={styles.stdSkillsRow}>
          {skills.slice(0, 3).map((skill) => (
            <View key={skill} style={styles.skillChipStd}>
              <Text style={styles.skillChipStdText}>{skill}</Text>
            </View>
          ))}
        </View>

        {/* Actions Footer */}
        <View style={styles.stdFooterRow}>
          <TouchableOpacity
            style={styles.stdBtnDetails}
            onPress={() =>
              navigation.navigate('CandidateProfileV2', {
                candidate: c,
                jobId: jobId || 'demo',
                job: jobInfo,
              })
            }
            activeOpacity={0.8}
          >
            <Text style={styles.stdBtnDetailsText}>Xem hồ sơ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.stdBtnSelect}
            onPress={() => promptBooking(c)}
            activeOpacity={0.85}
          >
            <Text style={styles.stdBtnSelectText}>Chọn bạn này</Text>
            <Ionicons name="checkmark-circle" size={15} color="#F26522" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ============================================================
  // HEADER COMPONENT (STITCH CAPSULE + RADAR + PILLS)
  // ============================================================
  const listHeader = (
    <View style={styles.listHeaderContainer}>
      {/* 1. JOB CONTEXT CAPSULE */}
      <View style={styles.jobCapsule}>
        <View style={styles.jobCapsuleStripe} />
        <View style={styles.jobCapsuleTopRow}>
          <View style={styles.categoryBadge}>
            <Ionicons
              name={
                jobInfo.category_icon ||
                (jobInfo.job_type === 'childcare' ? 'heart' : jobInfo.job_type === 'pickup' ? 'car' : 'school')
              }
              size={13}
              color="#EA580C"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.categoryBadgeText}>
              {jobInfo.category_label ||
                (jobInfo.job_type === 'childcare'
                  ? 'CHĂM SÓC & TRÔNG TRẺ'
                  : jobInfo.job_type === 'pickup'
                  ? 'ĐƯA ĐÓN TRẺ AN TOÀN'
                  : 'GIA SƯ & KÈM HỌC 1:1')}
            </Text>
          </View>
          <Text style={styles.hourlyFeeText}>
            {jobInfo.hourly_rate_vnd
              ? `${Number(jobInfo.hourly_rate_vnd).toLocaleString('vi-VN')}đ/giờ`
              : '120.000đ/giờ'}
          </Text>
        </View>

        <Text style={styles.jobTitleText} numberOfLines={2}>
          {jobInfo.title ||
            (jobInfo.job_type === 'childcare'
              ? 'Chăm sóc & Trông trẻ tại nhà'
              : jobInfo.job_type === 'pickup'
              ? 'Đưa đón bé đi học an toàn'
              : 'Gia sư kèm học 1:1')}
        </Text>

        <View style={styles.jobMetaList}>
          <View style={styles.jobMetaRow}>
            <Ionicons name="calendar-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.jobMetaText}>
              {jobInfo.schedule || 'Lịch học linh hoạt'}
            </Text>
          </View>
          <View style={styles.jobMetaRow}>
            <Ionicons name="location-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.jobMetaText}>
              {jobInfo.location_note || 'Hà Nội'}
            </Text>
          </View>
        </View>
      </View>

      {/* 2. ALGORITHM LIVE STATUS (EMERALD RADAR PULSING) */}
      <View style={styles.radarBanner}>
        <View style={styles.radarLeftGroup}>
          <View style={styles.radarDotWrapper}>
            <Animated.View
              style={[
                styles.radarPulseRing,
                { transform: [{ scale: pulseAnim }] },
              ]}
            />
            <View style={styles.radarCoreDot} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.radarTitleText}>
              {candidates.length > 0
                ? `Tuyển chọn ${displayedCandidates.length} CarePartner xuất sắc nhất`
                : 'Đang mở rộng quét mạng lưới CarePartner...'}
            </Text>
            <Text style={styles.radarSubtitleText}>
              {candidates.length > 0
                ? 'Khớp chuyên môn · Ưu tiên gần nhà · Đã đối soát CCCD & Thẻ SV'
                : 'Chưa có ứng viên khớp chuyên môn rảnh ca này. Đang phát tín hiệu tiếp tục.'}
            </Text>
          </View>
        </View>
        <Ionicons name="sparkles" size={20} color={candidates.length > 0 ? '#059669' : '#F59E0B'} />
      </View>

      {/* 3. FILTER & SORT PILLS */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterPillsContainer}
      >
        <TouchableOpacity
          style={[styles.filterPill, currentSort === 'score' && styles.filterPillActive]}
          onPress={() => setCurrentSort('score')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="ribbon"
            size={14}
            color={currentSort === 'score' ? '#ffffff' : '#64748B'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.filterPillText,
              currentSort === 'score' && styles.filterPillTextActive,
            ]}
          >
            Điểm phù hợp nhất
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, currentSort === 'distance' && styles.filterPillActive]}
          onPress={() => setCurrentSort('distance')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="navigate"
            size={14}
            color={currentSort === 'distance' ? '#ffffff' : '#64748B'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.filterPillText,
              currentSort === 'distance' && styles.filterPillTextActive,
            ]}
          >
            Gần nhà nhất
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, currentSort === 'rating' && styles.filterPillActive]}
          onPress={() => setCurrentSort('rating')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="star"
            size={14}
            color={currentSort === 'rating' ? '#ffffff' : '#64748B'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.filterPillText,
              currentSort === 'rating' && styles.filterPillTextActive,
            ]}
          >
            Đánh giá cao nhất
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, filterFemaleOnly && styles.filterPillActive]}
          onPress={() => setFilterFemaleOnly((prev) => !prev)}
          activeOpacity={0.8}
        >
          <Ionicons
            name="female"
            size={14}
            color={filterFemaleOnly ? '#ffffff' : '#64748B'}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.filterPillText,
              filterFemaleOnly && styles.filterPillTextActive,
            ]}
          >
            Chỉ xem Nữ {filterFemaleOnly ? '✓' : ''}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // ============================================================
  // FOOTER COMPONENT (SAFETY GUARANTEE)
  // ============================================================
  const listFooter = (
    <View style={styles.footerGuaranteeCard}>
      <View style={styles.guaranteeHeaderRow}>
        <Ionicons name="shield-checkmark" size={20} color="#2563EB" style={{ marginRight: 8 }} />
        <Text style={styles.guaranteeTitle}>Cam kết bảo vệ phụ huynh EduCareLink</Text>
      </View>
      <View style={styles.guaranteeItem}>
        <Ionicons name="checkmark-circle" size={15} color="#059669" style={{ marginRight: 6, marginTop: 2 }} />
        <Text style={styles.guaranteeDesc}>
          <Text style={{ fontWeight: '700', color: '#1E293B' }}>Ký quỹ an toàn MoMo Escrow: </Text>
          Chỉ giải ngân cho CarePartner sau khi ca làm kết thúc và bạn xác nhận hài lòng.
        </Text>
      </View>
      <View style={styles.guaranteeItem}>
        <Ionicons name="checkmark-circle" size={15} color="#059669" style={{ marginRight: 6, marginTop: 2 }} />
        <Text style={styles.guaranteeDesc}>
          <Text style={{ fontWeight: '700', color: '#1E293B' }}>Bảo hiểm đổi ứng viên 100%: </Text>
          Miễn phí đổi bạn khác ngay lập tức nếu phát sinh trường hợp bất khả kháng.
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. TOP APP BAR (STITCH HEADER) */}
      <View style={styles.topAppBar}>
        <TouchableOpacity
          style={styles.appBarBackBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
        >
          <Ionicons name="arrow-back" size={22} color="#1A1A2E" />
          <Text style={styles.backBtnText}>Quay lại</Text>
        </TouchableOpacity>

        <View style={styles.topGuaranteePill}>
          <Ionicons name="shield-checkmark" size={14} color="#2563EB" style={{ marginRight: 4 }} />
          <Text style={styles.topGuaranteeText}>EduCareLink Guarantee</Text>
        </View>
      </View>

      {/* 2. BODY CONTENT */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F26522" />
          <Text style={styles.loadingTitle}>Thuật toán ELO đang xếp hạng ứng viên...</Text>
          <Text style={styles.loadingSubtitle}>
            Đối soát lịch rảnh, cự ly GPS và kinh nghiệm giảng dạy thực tế
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayedCandidates}
          keyExtractor={(item) => item.carepartner_id}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#F26522']} />
          }
          renderItem={({ item, index }) => {
            // Render Card #1 với Hero Spotlight Layout
            if (index === 0 && currentSort === 'score' && !filterFemaleOnly) {
              return renderHeroCard(item);
            }
            // Render Cards #2 qua #8 với Standard Layout
            return renderStandardCard(item, index);
          }}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            candidates.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="search-outline" size={38} color="#F26522" />
                </View>
                <Text style={styles.emptyTitle}>Chưa có CarePartner phù hợp</Text>
                <Text style={styles.emptySubtitle}>
                  Hiện chưa có CarePartner nào có kỹ năng & kinh nghiệm về "{jobInfo.title || 'công việc này'}" rảnh vào khung giờ đã chọn ({jobInfo.schedule || 'ca này'}).
                </Text>
                <View style={styles.emptyAdviceCard}>
                  <Text style={styles.emptyAdviceTitle}>💡 Gợi ý cho bạn:</Text>
                  <Text style={styles.emptyAdviceText}>• Thử nới rộng khung giờ hoặc chọn ngày khác để có thêm ứng viên rảnh lịch.</Text>
                  <Text style={styles.emptyAdviceText}>• Hệ thống vẫn đang phát thông báo tới các sinh viên chuyên ngành quanh khu vực của bạn.</Text>
                </View>
                <TouchableOpacity
                  style={styles.resetFilterBtn}
                  onPress={() => load(true)}
                  activeOpacity={0.85}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="refresh" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.resetFilterBtnText}>Tìm kiếm lại</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons name="filter-outline" size={42} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Không có ứng viên khớp bộ lọc</Text>
                <Text style={styles.emptySubtitle}>
                  Có {candidates.length} ứng viên phù hợp kỹ năng nhưng chưa khớp tiêu chí lọc hiện tại.
                </Text>
                <TouchableOpacity
                  style={styles.resetFilterBtn}
                  onPress={() => {
                    setCurrentSort('score');
                    setFilterFemaleOnly(false);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.resetFilterBtnText}>Xem tất cả {candidates.length} ứng viên</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      )}

      {/* ============================================================ */}
      {/* 3. CONFIRMATION BOOKING MODAL (POPUP STITCH)                 */}
      {/* ============================================================ */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Xác nhận ghép cặp CarePartner</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Candidate Quick Card */}
            {selectedCandidate && (
              <View style={styles.modalCandidateBox}>
                <View
                  style={[
                    styles.modalAvatar,
                    { backgroundColor: AVATAR_COLORS[0] },
                  ]}
                >
                  <Text style={styles.modalAvatarText}>
                    {getInitial(selectedCandidate.display_name)}
                  </Text>
                </View>
                <View style={styles.modalCandidateInfo}>
                  <Text style={styles.modalCandidateName} numberOfLines={1}>
                    {selectedCandidate.display_name}
                  </Text>
                  <Text style={styles.modalCandidateSchool} numberOfLines={1}>
                    {selectedCandidate.school || 'Đại học Sư Phạm Hà Nội'}
                  </Text>
                  <Text style={styles.modalCandidateScore}>
                    Điểm phù hợp: {selectedCandidate.match_score}/100 · Cách{' '}
                    {selectedCandidate.distance_km || 1.2} km
                  </Text>
                </View>
              </View>
            )}

            {/* Fee & Policy Breakdown */}
            <View style={styles.modalDetailsBox}>
              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>Học phí dự kiến:</Text>
                <Text style={styles.modalDetailFee}>240.000đ (ca 2h)</Text>
              </View>
              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailLabel}>Lịch làm việc:</Text>
                <Text style={styles.modalDetailValue}>{jobInfo.schedule}</Text>
              </View>
              <View style={[styles.modalDetailRow, { borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 8, marginTop: 4 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="lock-closed" size={13} color="#2563EB" style={{ marginRight: 4 }} />
                  <Text style={styles.modalDetailEscrow}>Ký quỹ tạm giữ:</Text>
                </View>
                <Text style={styles.modalDetailEscrowBold}>MoMo Escrow Bảo Vệ</Text>
              </View>
            </View>

            {/* Modal Buttons */}
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelBtnText}>Xem bạn khác</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleConfirmBooking}
                disabled={submittingBooking}
                activeOpacity={0.85}
              >
                {submittingBooking ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.modalConfirmBtnText}>Xác nhận đặt lịch</Text>
                    <Ionicons name="checkmark" size={16} color="#ffffff" style={{ marginLeft: 4 }} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// STYLESHEET (WARM PROFESSIONALISM + GOOGLE STITCH SPEC)
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB', // Canvas Bg Stitch
  },

  // 1. TOP APP BAR
  topAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  appBarBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  topGuaranteePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  topGuaranteeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },

  // 2. LIST CONTENT
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  listHeaderContainer: {
    marginBottom: 12,
  },

  // 3. JOB CONTEXT CAPSULE
  jobCapsule: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.small,
  },
  jobCapsuleStripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
    backgroundColor: '#F26522',
  },
  jobCapsuleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingLeft: 4,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EA580C',
    textTransform: 'uppercase',
  },
  hourlyFeeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F26522',
  },
  jobTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A2E',
    lineHeight: 21,
    paddingLeft: 4,
    marginBottom: 8,
  },
  jobMetaList: {
    gap: 4,
    paddingLeft: 4,
  },
  jobMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  jobMetaText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  // 4. RADAR BANNER
  radarBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  radarLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  radarDotWrapper: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarPulseRing: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#34D399',
    opacity: 0.6,
  },
  radarCoreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#059669',
  },
  radarTitleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#064E3B',
  },
  radarSubtitleText: {
    fontSize: 10,
    color: '#047857',
    marginTop: 1,
  },

  // 5. FILTER PILLS
  filterPillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  filterPillActive: {
    backgroundColor: '#F26522',
    borderColor: '#F26522',
    ...SHADOWS.small,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },

  // 6. HERO CARD (#1 SPOTLIGHT)
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FED7AA',
    marginBottom: 14,
    ...SHADOWS.medium,
  },
  heroRibbonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  heroRibbonText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  verifiedCheckBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verifiedCheckText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E9F6E',
  },
  heroProfileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroAvatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  heroAvatar: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  heroAvatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroAvatarBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: '#0E9F6E',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroInfoCol: {
    flex: 1,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A2E',
    flex: 1,
  },
  cpIdText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  heroSchoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  heroSchoolText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    flex: 1,
  },
  heroMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metricBold: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
  },
  metricMuted: {
    fontSize: 11,
    color: '#64748B',
  },
  metricText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  metricGreen: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0E9F6E',
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  skillChipHero: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  skillChipHeroText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  heroReviewBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
  },
  heroReviewText: {
    fontSize: 11.5,
    fontStyle: 'italic',
    color: '#475569',
    lineHeight: 16,
  },
  heroReviewAuthor: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 3,
  },
  heroActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  heroBtnSecondary: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  heroBtnPrimary: {
    flex: 2,
    backgroundColor: '#F26522',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    ...SHADOWS.small,
  },
  heroBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // 7. STANDARD CARD (#2 - #8)
  standardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    ...SHADOWS.small,
  },
  stdTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stdAvatarWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  stdAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stdAvatarText: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  rankBadge: {
    position: 'absolute',
    top: -4,
    left: -4,
    backgroundColor: '#1E293B',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  rankBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  stdInfoCol: {
    flex: 1,
  },
  stdNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stdName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A2E',
    flex: 1,
  },
  stdScoreCol: {
    alignItems: 'flex-end',
  },
  stdScoreNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F26522',
  },
  stdScoreUnit: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: -2,
  },
  stdSchool: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 2,
  },
  stdMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  metricBoldSmall: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  metricMutedSmall: {
    fontSize: 11,
    color: '#64748B',
  },
  metricDot: {
    color: '#CBD5E1',
  },
  stdFastTag: {
    fontSize: 11,
    color: '#0E9F6E',
    fontWeight: '700',
  },
  stdSkillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  skillChipStd: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  skillChipStdText: {
    fontSize: 10.5,
    color: '#475569',
    fontWeight: '500',
  },
  stdFooterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  stdBtnDetails: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  stdBtnDetailsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  stdBtnSelect: {
    flex: 1,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  stdBtnSelectText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
  },

  // 8. GUARANTEE FOOTER
  footerGuaranteeCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
  },
  guaranteeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  guaranteeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  guaranteeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  guaranteeDesc: {
    fontSize: 11,
    color: '#1E293B',
    flex: 1,
    lineHeight: 16,
  },

  // 9. LOADING & EMPTY STATES
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A2E',
    marginTop: 12,
  },
  loadingSubtitle: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A2E',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },
  resetFilterBtn: {
    marginTop: 14,
    backgroundColor: '#F26522',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  resetFilterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF7ED',
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyAdviceCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 14,
    width: '90%',
  },
  emptyAdviceTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
  },
  emptyAdviceText: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 4,
  },

  // 10. MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    ...SHADOWS.large,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A2E',
  },
  modalCandidateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  modalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  modalAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalCandidateInfo: {
    flex: 1,
  },
  modalCandidateName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1A2E',
  },
  modalCandidateSchool: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  modalCandidateScore: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EA580C',
    marginTop: 2,
  },
  modalDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 6,
    marginBottom: 16,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalDetailLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  modalDetailFee: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1A2E',
  },
  modalDetailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  modalDetailEscrow: {
    fontSize: 11.5,
    color: '#2563EB',
    fontWeight: '600',
  },
  modalDetailEscrowBold: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  modalConfirmBtn: {
    flex: 1.5,
    backgroundColor: '#F26522',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  modalConfirmBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
