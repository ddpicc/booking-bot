import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Button, Picker, Input, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useStore } from '../../store';
import { Booking } from '../../types';
import { formatTime, callService } from '../../utils';
import dayjs from 'dayjs';
import './index.css';

const CoachHome: React.FC = () => {
  const router = Taro.useRouter();
  const coachIdFromQuery = router.params.coachId || 'coach';
  const coachId = coachIdFromQuery;

  const {
    bookings,
    updateBookingStatus,
    setBookings,
    services,
  } = useStore();

  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [showLockModal, setShowLockModal] = useState(false);
  const [lockStartTime, setLockStartTime] = useState('09:00');
  const [lockEndTime, setLockEndTime] = useState('10:00');
  const [lockReason, setLockReason] = useState('私人时间');
  const [modalMode, setModalMode] = useState<'lock' | 'booking'>('lock');
  const [studentName, setStudentName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [serviceIndex, setServiceIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // 从云端获取数据
  const fetchData = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const [bookingRes, lockRes] = await Promise.all([
        callService('booking', 'listByDate', { coachId, date }),
        callService('lock', 'listByDate', { coachId, date })
      ]) as any;

      if (bookingRes.result?.ok && lockRes.result?.ok) {
        const remoteBookings = bookingRes.result.data.map((b: any) => ({
          ...b,
          id: b._id,
        }));

        const remoteLocks = lockRes.result.data.map((l: any) => ({
          ...l,
          id: l._id,
          studentId: coachId,
          studentName: '已锁定',
          serviceId: 'locked',
          serviceName: '私人时间',
          isLocked: true,
          status: 'confirmed',
          lockReason: l.reason
        }));

        const incomingData = [...remoteBookings, ...remoteLocks];
        setBookings(incomingData);
      }
    } catch (error) {
      console.error('Fetch data failed:', error);
    } finally {
      setLoading(false);
    }
  }, [coachId, setBookings]);

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // 处理预约状态更新
  const handleStatusUpdate = async (id: string, status: Booking['status']) => {
    try {
      Taro.showLoading({ title: '处理中...' });
      const res = await callService('booking', 'updateStatus', {
        bookingId: id,
        status: status
      }) as any;

      if (res.result?.ok) {
        updateBookingStatus(id, status);
        Taro.showToast({ title: status === 'confirmed' ? '已通过' : '已拒绝', icon: 'success' });
      } else {
        Taro.showToast({ title: '操作失败', icon: 'none' });
      }
    } catch (error) {
      console.error('Update status failed:', error);
      Taro.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      Taro.hideLoading();
    }
  };

  // 生成日期导航
  const dateNavList = useMemo(() => {
    const dates: any[] = [];
    const today = dayjs();
    for (let i = 0; i < 14; i++) {
      const date = today.add(i, 'day');
      dates.push({
        date: date.format('YYYY-MM-DD'),
        day: date.format('ddd'),
        dayNumber: date.date(),
        isActive: date.format('YYYY-MM-DD') === selectedDate,
      });
    }
    return dates;
  }, [selectedDate]);

  // 处理手动操作
  const handleManualAction = async () => {
    const start = dayjs(`${selectedDate} ${lockStartTime}`);
    const end = dayjs(`${selectedDate} ${lockEndTime}`);

    if (end.isBefore(start) || end.isSame(start)) {
      Taro.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' });
      return;
    }

    if (modalMode === 'booking') {
      if (!studentName.trim()) {
        Taro.showToast({ title: '请输入学员姓名', icon: 'none' });
        return;
      }
      const selectedService = services[serviceIndex] || services[0];
      Taro.showLoading({ title: '创建中...' });
      const res = await callService('booking', 'create', {
        coachId,
        studentName,
        phoneNumber,
        serviceId: selectedService?.id || 'manual',
        serviceName: selectedService?.name || '代开课程',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        status: 'confirmed'
      }) as any;
      if (res.result?.ok) {
        fetchData(selectedDate);
        handleCloseModal();
        Taro.showToast({ title: '预约成功', icon: 'success' });
      }
    } else {
      Taro.showLoading({ title: '锁定中...' });
      const res = await callService('lock', 'create', {
        coachId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        reason: lockReason
      }) as any;
      if (res.result?.ok) {
        fetchData(selectedDate);
        handleCloseModal();
        Taro.showToast({ title: '已锁定时间', icon: 'success' });
      }
    }
    Taro.hideLoading();
  };

  const handleCloseModal = () => {
    setShowLockModal(false);
    setStudentName('');
    setPhoneNumber('');
  };

  // 生成时间轴数据 (Morning, Afternoon, Evening)
  const timelineData = useMemo(() => {
    const dayItems = bookings.filter(b => dayjs(b.startTime).format('YYYY-MM-DD') === selectedDate)
      .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());

    const result: any[] = [];
    const periods = [
      { label: '上午', hour: 9, next: 13 },
      { label: '下午', hour: 13, next: 18 },
      { label: '晚上', hour: 18, next: 22 }
    ];

    periods.forEach(p => {
      result.push({ type: 'period', label: p.label });
      const periodStart = dayjs(`${selectedDate} ${p.hour < 10 ? '0' + p.hour : p.hour}:00`);
      const periodEnd = dayjs(`${selectedDate} ${p.next}:00`);

      const periodItems = dayItems.filter(item => {
        const itemStart = dayjs(item.startTime);
        return (itemStart.isSame(periodStart) || itemStart.isAfter(periodStart)) && itemStart.isBefore(periodEnd);
      });

      if (periodItems.length === 0) {
        result.push({ type: 'slot', time: periodStart.format('HH:mm') });
      } else {
        periodItems.forEach(item => {
          result.push({
            type: item.isLocked ? 'locked' : 'booking',
            time: formatTime(item.startTime),
            booking: item,
            status: item.status
          });
        });
      }
    });

    result.push({ type: 'period', label: '22:00' });
    return result;
  }, [bookings, selectedDate]);

  const pendingCount = bookings.filter(b => b.status === 'pending' && !b.isLocked).length;

  return (
    <View className="coach-page">
      <View className="coach-nav-wrapper">
        <View className="coach-nav">
          <ScrollView className="coach-nav-scroll" scrollX scrollWithAnimation>
            <View className="coach-nav-scroll-inner">
              {dateNavList.map((date, index) => (
                <View
                  key={index}
                  className={`coach-nav-item ${date.isActive ? 'active' : ''}`}
                  onClick={() => setSelectedDate(date.date)}
                >
                  <Text className="coach-nav-day">{date.day}</Text>
                  <Text className="coach-nav-date">{date.dayNumber}</Text>
                  {date.isActive && <View className="coach-nav-active-indicator" />}
                </View>
              ))}
              <View className="coach-nav-scroll-end-spacer" />
            </View>
          </ScrollView>
          <View className="coach-nav-fade" />
        </View>
        <Picker mode="date" value={selectedDate} onChange={e => setSelectedDate(e.detail.value)}>
          <View className="coach-nav-picker">
            <Text className="material-symbols-outlined coach-nav-picker-icon">calendar_month</Text>
          </View>
        </Picker>
      </View>

      <ScrollView className="coach-content">
        <View className="coach-content-inner">
          {pendingCount > 0 && (
            <View className="coach-alert">
              <View className="coach-alert-content">
                <View className="coach-alert-icon">
                  <Text className="material-symbols-outlined coach-alert-icon-symbol">notification_important</Text>
                </View>
                <View className="coach-alert-text">
                  <Text className="coach-alert-title">{pendingCount} 个待处理预约</Text>
                  <Text className="coach-alert-subtitle">请确认学员的课程申请</Text>
                </View>
              </View>
            </View>
          )}

          <View className="coach-section">
            <Text className="coach-section-title">今日排课 · {selectedDate}</Text>
            {loading && <Text className="coach-section-subtitle">同步中...</Text>}
          </View>

          <View className="coach-timeline">
            {timelineData.map((item, index) => {
              if (item.type === 'period') {
                return (
                  <View key={index} className="coach-timeline-period">
                    <Text className="coach-timeline-period-label">{item.label}</Text>
                    <View className="coach-timeline-period-dot" />
                  </View>
                );
              }

              if (item.type === 'slot') {
                return (
                  <View key={index} className="coach-timeline-item">
                    <View className="coach-timeline-time">
                      <Text className="coach-timeline-time-label">{item.time}</Text>
                      <View className="coach-timeline-time-dot" style={{ backgroundColor: '#e2e8f0' }} />
                    </View>
                    <View className="coach-timeline-content">
                      <View className="coach-empty-slot">
                        <Text className="coach-empty-slot-text">暂无安排</Text>
                        <Text className="coach-empty-slot-time">{item.time} - {dayjs(`${selectedDate} ${item.time}`).add(60, 'm').format('HH:mm')}</Text>
                      </View>
                    </View>
                  </View>
                );
              }

              const booking = item.booking;
              return (
                <View key={index} className="coach-timeline-item">
                  <View className="coach-timeline-time">
                    <Text className="coach-timeline-time-label">{item.time}</Text>
                    <View className={`coach-timeline-time-dot ${item.status === 'pending' ? 'pending' : ''}`} />
                  </View>
                  <View className="coach-timeline-content">
                    <View className={`coach-booking-card ${item.type === 'locked' ? 'locked' : item.status}`}>
                      <View className="coach-booking-header">
                        <View>
                          <Text className="coach-booking-type">{item.type === 'locked' ? '锁定' : (booking.serviceName || '课程')}</Text>
                          <Text className="coach-booking-title">{item.type === 'locked' ? booking.lockReason : `学员: ${booking.studentName}`}</Text>
                        </View>
                        <Text className="material-symbols-outlined coach-booking-icon">
                          {item.type === 'locked' ? 'lock' : (item.status === 'confirmed' ? 'verified' : 'pending')}
                        </Text>
                      </View>
                      <View className="coach-booking-details">
                        <View className="coach-booking-detail">
                          <Text className="material-symbols-outlined" style={{ fontSize: '14px' }}>schedule</Text>
                          <Text>{formatTime(booking.startTime)} - {formatTime(booking.endTime)}</Text>
                        </View>
                        {booking.phoneNumber && (
                          <View className="coach-booking-detail">
                            <Text className="material-symbols-outlined" style={{ fontSize: '14px' }}>call</Text>
                            <Text>{booking.phoneNumber}</Text>
                          </View>
                        )}
                      </View>
                      {!item.isLocked && item.status === 'pending' && (
                        <View className="coach-booking-actions">
                          <Button className="coach-booking-action reject" onClick={() => handleStatusUpdate(booking.id, 'cancelled')}>拒绝</Button>
                          <Button className="coach-booking-action approve" onClick={() => handleStatusUpdate(booking.id, 'confirmed')}>通过</Button>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View className="coach-floating-button" onClick={() => setShowLockModal(true)}>
        <Text className="material-symbols-outlined coach-floating-icon">add</Text>
      </View>

      {showLockModal && (
        <View className="coach-lock-modal-overlay">
          <View className="coach-lock-modal animate-in">
            <View className="coach-lock-modal-header">
              <View className="coach-lock-modal-tabs">
                <View className={`coach-lock-modal-tab ${modalMode === 'lock' ? 'active' : ''}`} onClick={() => setModalMode('lock')}>锁定时间</View>
                <View className={`coach-lock-modal-tab ${modalMode === 'booking' ? 'active' : ''}`} onClick={() => setModalMode('booking')}>代开课程</View>
              </View>
              <Text className="coach-lock-modal-close" onClick={handleCloseModal}>✕</Text>
            </View>
            <View className="coach-lock-modal-content">
              <View className="coach-lock-modal-form">
                <View className="coach-lock-modal-row">
                  <View className="coach-lock-modal-form-item flex-1">
                    <Text className="coach-lock-modal-form-label">开始时间</Text>
                    <Picker mode="time" value={lockStartTime} onChange={e => setLockStartTime(e.detail.value)}>
                      <View className="coach-lock-modal-picker">
                        <Text className="coach-lock-modal-picker-value">{lockStartTime}</Text>
                        <Text className="coach-lock-modal-picker-icon">▾</Text>
                      </View>
                    </Picker>
                  </View>
                  <View className="coach-lock-modal-form-item flex-1">
                    <Text className="coach-lock-modal-form-label">结束时间</Text>
                    <Picker mode="time" value={lockEndTime} onChange={e => setLockEndTime(e.detail.value)}>
                      <View className="coach-lock-modal-picker">
                        <Text className="coach-lock-modal-picker-value">{lockEndTime}</Text>
                        <Text className="coach-lock-modal-picker-icon">▾</Text>
                      </View>
                    </Picker>
                  </View>
                </View>

                {modalMode === 'lock' ? (
                  <View className="coach-lock-modal-form-item">
                    <Text className="coach-lock-modal-form-label">备注原因</Text>
                    <Input className="coach-lock-modal-form-input" value={lockReason} onInput={e => setLockReason(e.detail.value)} placeholder="如：私人安排、休息等" />
                  </View>
                ) : (
                  <>
                    <View className="coach-lock-modal-form-item">
                      <Text className="coach-lock-modal-form-label">学员姓名</Text>
                      <Input className="coach-lock-modal-form-input" value={studentName} onInput={e => setStudentName(e.detail.value)} placeholder="请输入学员姓名" />
                    </View>
                    <View className="coach-lock-modal-form-item">
                      <Text className="coach-lock-modal-form-label">联系电话</Text>
                      <Input className="coach-lock-modal-form-input" type="number" value={phoneNumber} onInput={e => setPhoneNumber(e.detail.value)} placeholder="选填" />
                    </View>
                  </>
                )}
              </View>
            </View>
            <View className="coach-lock-modal-actions">
              <Button className="coach-lock-modal-button confirm" onClick={handleManualAction}>确认保存</Button>
            </View>
          </View>
        </View>
      )}

      <View className="coach-bottom-nav">
        <View className="coach-nav-item-bottom active">
          <Text className="material-symbols-outlined coach-nav-item-bottom-icon">calendar_today</Text>
          <Text className="coach-nav-item-bottom-text">日程</Text>
        </View>
        <View className="coach-nav-item-bottom" onClick={() => Taro.navigateTo({ url: '/pages/students/index' })}>
          <Text className="material-symbols-outlined coach-nav-item-bottom-icon">group</Text>
          <Text className="coach-nav-item-bottom-text">学员</Text>
        </View>
        <View className="coach-nav-item-bottom" onClick={() => Taro.navigateTo({ url: '/pages/settings/index' })}>
          <Text className="material-symbols-outlined coach-nav-item-bottom-icon">settings</Text>
          <Text className="coach-nav-item-bottom-text">设置</Text>
        </View>
      </View>
    </View>
  );
};

export default CoachHome;
