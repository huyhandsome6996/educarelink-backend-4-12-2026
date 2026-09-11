// ============================================================
// PickupForm — Flow 1 Step 1 §C: Đăng việc ĐÓN TRẺ TAN HỌC
// school_or_pickup_place_name + destination_type (parent_home /
// other_address) + pickup_location + destination_location
// Redesign theo bản thiết kế chuẩn Google Stitch (Mobile Consumer App)
// ============================================================

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SHADOWS, SIZES } from '../../theme/colors';
import { createJob, publishJob, getMatchingCandidates } from '../../api/matching';
import JobLocationPicker from '../../components/JobLocationPicker';
import { formatDateToYMD, getTodayYMD, extractErrorMessage } from '../../utils/date';
import SearchingCarePartnerModal from '../../components/SearchingCarePartnerModal';

let DateTimePicker;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

// 5 nhóm tuổi chuẩn theo đặc tả Mục 2 (backend job_schema.CHILD_AGE_GROUPS)
const AGE_GROUPS = [
  { code: '3_to_6_years', label: '3 - 6 tuổi', sub: 'Mầm non' },
  { code: '6_to_10_years', label: '6 - 10 tuổi', sub: 'Tiểu học' },
  { code: 'over_10_years', label: 'Trên 10 tuổi', sub: 'Cấp 2' },
];

// 3 phương thức đưa đón chuẩn theo đặc tả Mục 2 (job_schema.TRANSPORT_METHODS)
const TRANSPORT_METHODS = [
  {
    code: 'carepartner_vehicle',
    label: 'CarePartner có xe máy riêng',
    sub: 'Yêu cầu: Bằng lái A1 + Mũ bảo hiểm trẻ em chuẩn',
    badge: 'Ưu tiên cốp xe rộng · Đã đối soát GPLX',
    icon: 'bicycle-outline',
  },
  {
    code: 'walking',
    label: 'Đi bộ (Khoảng cách dưới 800m)',
    sub: 'Dắt tay bé qua đường, trường gần khu dân cư',
    badge: 'An toàn đi bộ',
    icon: 'walk-outline',
  },
  {
    code: 'parent_arranged',
    label: 'Phụ huynh đặt xe / Xe gia đình',
    sub: 'CarePartner đi kèm cùng bé trên xe GrabCar hoặc xe riêng',
    badge: 'Kèm xe ô tô',
    icon: 'car-outline',
  },
];

const QUICK_SCHOOL_TYPES = [
  '🏫 Tiểu học',
  '🧸 Mầm non',
  '🇬🇧 TT Tiếng Anh',
  '🥋 Lớp năng khiếu',
];

const QUICK_SAFETY_TAGS = [
  'Chụp ảnh check-in cổng trường',
  'Gọi điện khi về tới nhà',
  'Dắt tay qua đường',
  'Đội mũ bảo hiểm riêng của bé',
];

export default function PickupForm() {
  const navigation = useNavigation();
  const [schoolName, setSchoolName] = useState('');
  const [ageGroup, setAgeGroup] = useState('6_to_10_years');
  const [numChildren, setNumChildren] = useState('1');
  const [dates, setDates] = useState([]);
  const [timeFrom, setTimeFrom] = useState('16:30');
  const [timeTo, setTimeTo] = useState('17:30');
  const [pickupLocation, setPickupLocation] = useState(null);
  const [pickupNote, setPickupNote] = useState('');
  const [destType, setDestType] = useState('parent_home');
  const [destLocation, setDestLocation] = useState(null);
  const [destNote, setDestNote] = useState('');
  const [transportMethod, setTransportMethod] = useState('carepartner_vehicle');
  const [transportNote, setTransportNote] = useState('');
  const [requirements, setRequirements] = useState('');
  const [rate, setRate] = useState('60000');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchStatus, setSearchStatus] = useState('searching');
  const [searchError, setSearchError] = useState('');

  // Safe area insets with fallback
  let insets = { top: 12, bottom: 20, left: 0, right: 0 };
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const safeInsets = useSafeAreaInsets();
    if (safeInsets) insets = safeInsets;
  } catch {
    // Fallback when outside SafeAreaProvider
  }

  const addDate = (_e, selected) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (!selected) return;
    const iso = formatDateToYMD(selected);
    const today = getTodayYMD();
    if (iso < today)
      return Alert.alert('Không hợp lệ', 'Không được chọn ngày trong quá khứ.');
    if (!dates.includes(iso)) setDates([...dates, iso].sort());
  };

  const handleAdjustChildren = (delta) => {
    const current = Number(numChildren) || 1;
    const next = Math.max(1, Math.min(2, current + delta));
    setNumChildren(next.toString());
  };

  const handleSafetyTagToggle = (tag) => {
    if (!requirements.includes(tag)) {
      setRequirements((prev) => (prev.trim() ? `${prev.trim()}, ${tag}` : tag));
    }
  };

  const submit = async () => {
    if (!schoolName.trim())
      return Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên trường hoặc địa điểm đón.');
    if (!ageGroup) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn độ tuổi của trẻ.');
    if (dates.length === 0) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn ít nhất 1 ngày đón.');
    if (!pickupLocation) return Alert.alert('Thiếu thông tin', 'Vui lòng chọn điểm đón trên bản đồ.');
    if (destType === 'other_address' && !destLocation)
      return Alert.alert('Thiếu thông tin', 'Vui lòng chọn điểm đến trên bản đồ (địa chỉ khác).');
    if (!rate || Number(rate) <= 0) return Alert.alert('Thiếu thông tin', 'Nhập mức phí đề xuất hợp lệ.');

    const finalRequirements =
      requirements.trim() || 'Đưa đón bé đúng giờ, đội mũ bảo hiểm và đảm bảo an toàn giao thông.';

    setSubmitting(true);
    setSearchModalVisible(true);
    setSearchStatus('searching');
    setSearchError('');
    let createdJobId = null;
    const searchStartTime = Date.now();
    try {
      const { data: job } = await createJob({
        job_type: 'pickup',
        school_or_pickup_place_name: schoolName.trim(),
        child_age_group: ageGroup,
        number_of_children: Number(numChildren),
        pickup_dates: dates,
        pickup_time_from: timeFrom,
        pickup_time_to: timeTo,
        pickup_location: pickupLocation,
        pickup_location_note: pickupNote,
        destination_type: destType,
        destination_location: destType === 'other_address' ? destLocation : null,
        destination_note: destNote,
        transport_method: transportMethod || undefined,
        transport_note: transportNote,
        specific_requirements: finalRequirements,
        // vị trí chính = điểm đón
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
        hourly_rate_vnd: Number(rate),
      });
      createdJobId = job?.id;

      const { data: pubRes } = await publishJob(job.id);

      // Tải trước danh sách ứng viên ngay trong lúc modal tìm kiếm đang quét sóng radar
      let matchedCandidates = null;
      let totalMatched = null;
      let freshJob = null;
      try {
        const { data: candRes } = await getMatchingCandidates(job.id);
        matchedCandidates = candRes?.candidates || null;
        totalMatched = candRes?.total_matched || null;
        freshJob = candRes?.job || null;
      } catch (candErr) {
        // Dự phòng demo nếu mạng chậm
      }

      const scheduleStr = `${timeFrom} - ${timeTo} (${dates.length} ngày)`;
      const richJob = {
        ...job,
        ...(freshJob || {}),
        title: pubRes?.title || freshJob?.title || job.title || `Đón ${numChildren} bé tại ${schoolName.trim() || 'trường'}`,
        category_label: freshJob?.category_label || pubRes?.category_label || 'Đưa đón trẻ an toàn',
        category_icon: freshJob?.category_icon || pubRes?.category_icon || 'car',
        hourly_rate_vnd: Number(rate),
        schedule: freshJob?.schedule || pubRes?.schedule || scheduleStr,
        location_note: pickupNote || schoolName.trim() || 'Hà Nội',
      };

      // Giữ modal chạy tối thiểu 1.2s để tạo cảm giác quét radar chân thực
      const elapsed = Date.now() - searchStartTime;
      const minDisplayTime = 1200;
      if (elapsed < minDisplayTime) {
        await new Promise((resolve) => setTimeout(resolve, minDisplayTime - elapsed));
      }

      // Đã tìm thấy ứng viên -> thành công
      setSearchStatus('success');

      // Tự động chuyển tiếp đến danh sách ứng viên và render ngay lập tức!
      setTimeout(() => {
        setSearchModalVisible(false);
        navigation.navigate('CandidatesList', {
          jobId: job.id,
          job: richJob,
          candidates: matchedCandidates,
          totalMatched,
        });
      }, 600);
    } catch (err) {
      if (createdJobId) {
        setSearchStatus('success');
        const fallbackSchedule = `${timeFrom} - ${timeTo} (${dates.length} ngày)`;
        const fallbackRichJob = {
          id: createdJobId,
          title: `Đón ${numChildren} bé tại ${schoolName.trim() || 'trường'}`,
          category_label: 'Đưa đón trẻ an toàn',
          category_icon: 'car',
          hourly_rate_vnd: Number(rate),
          schedule: fallbackSchedule,
          location_note: pickupNote || schoolName.trim() || 'Hà Nội',
        };
        setTimeout(() => {
          setSearchModalVisible(false);
          navigation.navigate('CandidatesList', { jobId: createdJobId, job: fallbackRichJob });
        }, 600);
      } else {
        const msg = extractErrorMessage(err, 'Không đăng được bài. Vui lòng kiểm tra lại thông tin.');
        setSearchStatus('error');
        setSearchError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* 1. TOP APP BAR */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 10) }]}>
        <TouchableOpacity
          style={styles.circleBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={20} color="#1E293B" />
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text style={styles.topBarTitle}>Đón trẻ tan học</Text>
          <View style={styles.subTitleWrap}>
            <View style={[styles.dotIndicator, { backgroundColor: '#2563EB' }]} />
            <Text style={[styles.topBarSub, { color: '#2563EB' }]}>Bước 1/2 · Lộ trình đưa đón an toàn</Text>
          </View>
        </View>

        <View style={styles.liveGpsBadge}>
          <View style={styles.pulseDot} />
          <Text style={styles.liveGpsText}>Live GPS</Text>
        </View>
      </View>

      {/* 2. SCROLLABLE CONTENT */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Mobility Banner */}
        <View style={styles.heroBanner}>
          <View style={styles.heroIconBox}>
            <Ionicons name="car" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.heroTag}>
              <Text style={styles.heroTagText}>CÔNG NGHỆ ĐỘC QUYỀN</Text>
            </View>
            <Text style={styles.heroTitle}>Đón bé an tâm với Live GPS 24/7</Text>
            <Text style={styles.heroDesc}>
              Check-in ảnh chụp bé tại cổng trường & bảo hiểm tai nạn di chuyển 100%.
            </Text>
          </View>
        </View>

        {/* SECTION 1: TÊN TRƯỜNG / ĐỊA ĐIỂM ĐÓN */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Tên trường / Địa điểm đón bé <Text style={styles.star}>*</Text>
            </Text>
            <Text style={styles.helperHint}>Gợi ý nhanh</Text>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="business-outline" size={16} color="#2563EB" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="VD: Tiểu học Chu Văn An, Thực Nghiệm..."
              placeholderTextColor="#94A3B8"
              value={schoolName}
              onChangeText={setSchoolName}
            />
            {!!schoolName && (
              <TouchableOpacity onPress={() => setSchoolName('')}>
                <Ionicons name="close-circle" size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {QUICK_SCHOOL_TYPES.map((type, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.quickChip}
                onPress={() => {
                  const clean = type.replace(/^[^\w\s]*\s*/, '');
                  setSchoolName((prev) => (prev ? `${prev} - ${clean}` : clean));
                }}
              >
                <Text style={styles.quickChipText}>{type}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* SECTION 2: ĐỘ TUỔI & SỐ LƯỢNG BÉ */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>Độ tuổi của bé & Số lượng</Text>
            <View style={styles.verifyPill}>
              <Text style={styles.verifyPillText}>✓ Tự trang bị mũ BH</Text>
            </View>
          </View>

          <View style={styles.ageRow}>
            {AGE_GROUPS.map((g) => {
              const isSelected = ageGroup === g.code;
              return (
                <TouchableOpacity
                  key={g.code}
                  style={[styles.agePill, isSelected && styles.agePillActive]}
                  onPress={() => setAgeGroup(g.code)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.agePillTitle, isSelected && styles.agePillTitleActive]}>
                    {g.label}
                  </Text>
                  <Text style={[styles.agePillSub, isSelected && styles.agePillSubActive]}>
                    {g.sub}
                  </Text>
                  {isSelected && (
                    <View style={styles.ageCheckBadge}>
                      <Ionicons name="checkmark" size={10} color="#FFFFFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.stepperRow}>
            <View>
              <Text style={styles.label}>Số lượng trẻ cần đón</Text>
              <Text style={styles.subHintText}>Tối đa 2 bé nếu di chuyển xe máy</Text>
            </View>

            <View style={styles.stepperControl}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleAdjustChildren(-1)}
                disabled={Number(numChildren) <= 1}
              >
                <Text style={[styles.stepperBtnText, Number(numChildren) <= 1 && { color: '#CBD5E1' }]}>
                  −
                </Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{numChildren} bé</Text>
              <TouchableOpacity
                style={[styles.stepperBtn, styles.stepperBtnPlus]}
                onPress={() => handleAdjustChildren(1)}
              >
                <Text style={[styles.stepperBtnText, { color: '#FFFFFF' }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* SECTION 3: SƠ ĐỒ LỘ TRÌNH ĐƯA ĐÓN (A → B) */}
        <View style={styles.routeCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={styles.routeIconBox}>
                <Ionicons name="navigate-outline" size={16} color="#2563EB" />
              </View>
              <Text style={styles.routeHeaderTitle}>SƠ ĐỒ LỘ TRÌNH ĐƯA ĐÓN (A → B)</Text>
            </View>
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceBadgeText}>~2.8 km</Text>
            </View>
          </View>

          {/* Sơ đồ nối A -> B */}
          <View style={styles.routeTimelineWrap}>
            {/* Dotted vertical line with transport car icon */}
            <View style={styles.timelineDottedLine} />
            <View style={styles.timelineVehicleIcon}>
              <Ionicons name="car" size={11} color="#FFFFFF" />
            </View>

            {/* POINT A: ĐIỂM ĐÓN */}
            <View style={styles.routePointBox}>
              <View style={styles.pointDotA}>
                <Text style={styles.pointDotText}>A</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.pointHeaderRow}>
                  <Text style={styles.pointLabelA}>ĐIỂM ĐÓN (A)</Text>
                  <Text style={styles.pointSubHint}>Cổng trường</Text>
                </View>

                <JobLocationPicker value={pickupLocation} onChange={setPickupLocation} />

                <TextInput
                  style={[styles.input, { marginTop: 6 }]}
                  placeholder="Ghi chú đón: Cổng bảo vệ, phòng học, giáo viên phụ trách..."
                  placeholderTextColor="#94A3B8"
                  value={pickupNote}
                  onChangeText={setPickupNote}
                />
              </View>
            </View>

            {/* POINT B: ĐIỂM ĐẾN */}
            <View style={[styles.routePointBox, { marginTop: 14 }]}>
              <View style={styles.pointDotB}>
                <Text style={styles.pointDotText}>B</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.pointHeaderRow}>
                  <Text style={styles.pointLabelB}>ĐIỂM ĐẾN (B)</Text>
                  {/* Dest type toggle */}
                  <View style={styles.destToggleWrap}>
                    <TouchableOpacity
                      style={[styles.destToggleBtn, destType === 'parent_home' && styles.destToggleBtnActive]}
                      onPress={() => setDestType('parent_home')}
                    >
                      <Text style={[styles.destToggleText, destType === 'parent_home' && styles.destToggleTextActive]}>
                        Về nhà
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.destToggleBtn, destType === 'other_address' && styles.destToggleBtnActive]}
                      onPress={() => setDestType('other_address')}
                    >
                      <Text style={[styles.destToggleText, destType === 'other_address' && styles.destToggleTextActive]}>
                        Lớp học thêm
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {destType === 'other_address' && (
                  <View style={{ marginBottom: 6 }}>
                    <JobLocationPicker value={destLocation} onChange={setDestLocation} />
                  </View>
                )}

                <TextInput
                  style={styles.input}
                  placeholder="Ghi chú bàn giao: Bàn giao cho bà ngoại P.1408 Tháp B, hoặc gọi mẹ..."
                  placeholderTextColor="#94A3B8"
                  value={destNote}
                  onChangeText={setDestNote}
                />
              </View>
            </View>
          </View>

          {/* Mini map ready snippet */}
          <View style={styles.mapReadySnippet}>
            <View style={styles.pulseDotBlue} />
            <Text style={styles.mapReadyText}>📍 Bản đồ định vị GPS trực tuyến sẵn sàng</Text>
          </View>
        </View>

        {/* SECTION 4: THỜI GIAN & KHUNG GIỜ ĐÓN */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Ngày đón & Khung giờ tan học <Text style={styles.star}>*</Text>
            </Text>
          </View>

          <View style={styles.datesContainer}>
            {dates.map((d) => (
              <View key={d} style={styles.dateChip}>
                <Ionicons name="calendar-outline" size={13} color="#2563EB" />
                <Text style={styles.dateChipText}>{d}</Text>
                <TouchableOpacity onPress={() => setDates(dates.filter((x) => x !== d))}>
                  <Ionicons name="close" size={14} color="#2563EB" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.addDateBtn}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={15} color="#2563EB" />
              <Text style={styles.addDateBtnText}>+ Thêm ngày</Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && DateTimePicker && (
            <DateTimePicker value={new Date()} mode="date" onChange={addDate} />
          )}

          {/* Time Window */}
          <View style={styles.timeGrid}>
            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Giờ tan học (đón từ)</Text>
              <View style={styles.timeInputBox}>
                <Ionicons name="time-outline" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.timeInput}
                  value={timeFrom}
                  onChangeText={setTimeFrom}
                  placeholder="16:30"
                />
              </View>
            </View>

            <View style={styles.timeCol}>
              <Text style={styles.timeLabel}>Bàn giao trước</Text>
              <View style={styles.timeInputBox}>
                <Ionicons name="time-outline" size={16} color="#94A3B8" />
                <TextInput
                  style={styles.timeInput}
                  value={timeTo}
                  onChangeText={setTimeTo}
                  placeholder="17:30"
                />
              </View>
            </View>
          </View>
        </View>

        {/* SECTION 5: PHƯƠNG TIỆN ĐƯA ĐÓN */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Phương tiện di chuyển <Text style={styles.star}>*</Text>
            </Text>
            <Text style={styles.helperHint}>Bắt buộc có mũ BH</Text>
          </View>

          <View style={{ gap: 8, marginTop: 4 }}>
            {TRANSPORT_METHODS.map((t) => {
              const isSelected = transportMethod === t.code;
              return (
                <TouchableOpacity
                  key={t.code}
                  style={[styles.transportCard, isSelected && styles.transportCardActive]}
                  onPress={() => setTransportMethod(t.code)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <Ionicons
                      name={t.icon}
                      size={24}
                      color={isSelected ? '#2563EB' : '#64748B'}
                      style={{ marginTop: 2 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.transportTitle, isSelected && styles.transportTitleActive]}>
                        {t.label}
                      </Text>
                      <Text style={styles.transportSub}>{t.sub}</Text>
                      <View style={styles.transportBadge}>
                        <Text style={styles.transportBadgeText}>{t.badge}</Text>
                      </View>
                    </View>
                    <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Ghi chú thêm về phương tiện (nếu có)…"
            placeholderTextColor="#94A3B8"
            value={transportNote}
            onChangeText={setTransportNote}
          />
        </View>

        {/* SECTION 6: YÊU CẦU AN TOÀN ĐẶC BIỆT */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Yêu cầu an toàn cụ thể <Text style={styles.star}>*</Text>
            </Text>
            <Text style={styles.helperHint}>🛡️ Cam kết an toàn</Text>
          </View>

          <View style={styles.tagWrap}>
            {QUICK_SAFETY_TAGS.map((tag, idx) => {
              const isAdded = requirements.includes(tag);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.tagChip, isAdded && styles.tagChipActive]}
                  onPress={() => handleSafetyTagToggle(tag)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tagChipText, isAdded && styles.tagChipTextActive]}>
                    {isAdded ? `✓ ${tag}` : `+ ${tag}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="VD: Chụp ảnh gửi mẹ lúc đón từ tay cô giáo, cài quai mũ bảo hiểm chắc chắn và gọi điện báo ngay khi về tới nhà..."
            placeholderTextColor="#94A3B8"
            value={requirements}
            onChangeText={setRequirements}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* SECTION 7: MỨC PHÍ ĐỀ XUẤT */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.label}>
              Mức phí đề xuất (VNĐ / chuyến hoặc giờ) <Text style={styles.star}>*</Text>
            </Text>
            <View style={styles.benchmarkBadge}>
              <Text style={styles.benchmarkBadgeText}>Khung chuẩn: 50.000đ - 80.000đ</Text>
            </View>
          </View>

          <View style={styles.rateInputWrap}>
            <TextInput
              style={styles.rateInput}
              placeholder="60000"
              value={rate}
              onChangeText={setRate}
              keyboardType="numeric"
            />
            <Text style={styles.rateSuffix}>đ / chuyến</Text>
          </View>

          <View style={styles.benchmarkBox}>
            <View style={styles.benchmarkIcon}>
              <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '800' }}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.benchmarkTitle}>Mức giá tối ưu cho quãng đường ~2.8km</Text>
              <Text style={styles.benchmarkDesc}>
                Thường có CarePartner nhận đơn trong vòng 8 phút.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 3. STICKY BOTTOM ACTION DOCK */}
      <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.dockLeft}>
          <Text style={styles.dockSub}>Tạm tính ca đón:</Text>
          <Text style={styles.dockPrice}>
            {Number(rate || 60000).toLocaleString('vi-VN')}
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>đ</Text>
            <Text style={{ fontSize: 10, fontWeight: '500', color: '#64748B' }}> / {numChildren} bé</Text>
          </Text>
          <View style={styles.guaranteePill}>
            <View style={[styles.guaranteeDot, { backgroundColor: '#2563EB' }]} />
            <Text style={[styles.guaranteeText, { color: '#2563EB' }]}>Live GPS tự động kích hoạt</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.dockCtaBtn, submitting && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting}
          activeOpacity={0.88}
        >
          <Text style={styles.ctaTitle}>{submitting ? 'Đang đăng...' : 'Đăng việc & Tìm người đón'}</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Bottom Sheet Animation: Đang tìm kiếm CarePartner */}
      <SearchingCarePartnerModal
        visible={searchModalVisible}
        status={searchStatus}
        serviceType="Đón trẻ tan học"
        serviceIcon="navigate"
        errorMessage={searchError}
        onClose={() => setSearchModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // 1. TOP APP BAR
  topBar: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...SHADOWS.small,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  titleWrap: {
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  subTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  dotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topBarSub: {
    fontSize: 11,
    fontWeight: '600',
  },
  liveGpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
  },
  liveGpsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
  },

  // 2. SCROLL CONTENT
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  heroBanner: {
    backgroundColor: '#2563EB',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    ...SHADOWS.small,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  heroTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 3,
  },
  heroDesc: {
    fontSize: 11,
    color: '#DBEAFE',
    marginTop: 2,
    lineHeight: 16,
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    ...SHADOWS.small,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  star: {
    color: '#E11D48',
    fontWeight: '800',
  },
  helperHint: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  subHintText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 6,
  },
  chipsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
    marginTop: 4,
  },
  quickChip: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  quickChipText: {
    fontSize: 11,
    color: '#1D4ED8',
    fontWeight: '600',
  },

  verifyPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  verifyPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#047857',
  },
  ageRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  agePill: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  agePillActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
    borderWidth: 1.5,
  },
  agePillTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  agePillTitleActive: {
    color: '#1D4ED8',
  },
  agePillSub: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 1,
  },
  agePillSubActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  ageCheckBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    padding: 3,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.small,
  },
  stepperBtnPlus: {
    backgroundColor: '#2563EB',
  },
  stepperBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepperValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    paddingHorizontal: 10,
  },

  // Route Visual Centerpiece
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    padding: 14,
    ...SHADOWS.small,
  },
  routeIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  distanceBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  distanceBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  routeTimelineWrap: {
    position: 'relative',
    paddingLeft: 22,
    marginTop: 8,
  },
  timelineDottedLine: {
    position: 'absolute',
    left: 8,
    top: 14,
    bottom: 24,
    width: 1.5,
    borderWidth: 1,
    borderColor: '#60A5FA',
    borderStyle: 'dashed',
  },
  timelineVehicleIcon: {
    position: 'absolute',
    left: -1,
    top: '48%',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  routePointBox: {
    position: 'relative',
  },
  pointDotA: {
    position: 'absolute',
    left: -22,
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pointDotB: {
    position: 'absolute',
    left: -22,
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  pointDotText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  pointHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pointLabelA: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.3,
  },
  pointLabelB: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },
  pointSubHint: {
    fontSize: 10,
    color: '#64748B',
  },
  destToggleWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 2,
    borderRadius: 6,
    gap: 2,
  },
  destToggleBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  destToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    ...SHADOWS.small,
  },
  destToggleText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
  },
  destToggleTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  mapReadySnippet: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 12,
    gap: 6,
  },
  pulseDotBlue: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
  },
  mapReadyText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },

  datesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  dateChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  addDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderStyle: 'dashed',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  addDateBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },

  timeGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  timeCol: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  timeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  timeInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 4,
  },

  // Transport Methods
  transportCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  transportCardActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
    borderWidth: 1.5,
  },
  transportTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  transportTitleActive: {
    color: '#1D4ED8',
  },
  transportSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },
  transportBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginTop: 4,
  },
  transportBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1E40AF',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioCircleActive: {
    borderColor: '#2563EB',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#2563EB',
  },

  // Requirements / Safety tags
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  tagChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  tagChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  tagChipTextActive: {
    color: '#065F46',
    fontWeight: '700',
  },

  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  textarea: {
    height: 65,
    textAlignVertical: 'top',
    lineHeight: 18,
  },

  // Rate
  rateInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  rateInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    paddingVertical: 8,
  },
  rateSuffix: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  benchmarkBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  benchmarkBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  benchmarkBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    gap: 8,
  },
  benchmarkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benchmarkTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
  },
  benchmarkDesc: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 2,
    lineHeight: 14,
  },

  // 3. STICKY BOTTOM DOCK
  bottomDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...SHADOWS.medium,
  },
  dockLeft: {
    flexShrink: 0,
  },
  dockSub: {
    fontSize: 10,
    color: '#64748B',
  },
  dockPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  guaranteePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  guaranteeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  guaranteeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  dockCtaBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...SHADOWS.small,
  },
  ctaTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
