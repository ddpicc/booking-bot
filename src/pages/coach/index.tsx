import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Button, Picker, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useStore } from '../../store';
import { Booking } from '../../types';
import { formatTime } from '../../utils';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import './index.css';

dayjs.extend(isSameOrAfter);

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

      // 获取当前日期的预约和锁定
      const [bookingRes, lockRes] = await Promise.all([
        Taro.cloud.callFunction({
          name: 'booking',
          data: { action: 'listByDate', coachId, date }
        }),
        Taro.cloud.callFunction({
          name: 'lock',
          data: { action: 'listByDate', coachId, date }
        })
      ]);

      const bResult: any = bookingRes.result;
      const lResult: any = lockRes.result;

      if (bResult.ok && lResult.ok) {
        const remoteBookings = bResult.data.map((b: any) => ({
          ...b,
          id: b._id,
        }));

        const remoteLocks = lResult.data.map((l: any) => ({
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

        // 获取其他日期的预约（保留本地非选定日期的缓存）
        setBookings(incomingData);
      }
    } catch (error) {
      console.error('Fetch data failed:', error);
    } finally {
      setLoading(false);
    }
  }, [setBookings]); // <--- 移除了对 bookings 的依赖，彻底解决无限循环

  useEffect(() => {
    fetchData(selectedDate);
  }, [selectedDate, fetchData]);

  // 处理预约状态更新
  const handleStatusUpdate = async (id: string, status: Booking['status']) => {
    try {
      Taro.showLoading({ title: '处理中...' });
      const res = await Taro.cloud.callFunction({
        name: 'booking',
        data: {
          action: 'updateStatus',
          bookingId: id,
          status: status
        }
      });

      const result: any = res.result;
      if (result.ok) {
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
  const generateDateNav = () => {
    const dates: Array<{
      date: string;
      day: string;
      dayNumber: number;
      isActive: boolean;
    }> = [];
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
  };

  const dateNavList = generateDateNav();

  // 处理日期选择
  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
  };

  const resetForm = () => {
    setLockStartTime('09:00');
    setLockEndTime('10:00');
    setLockReason('私人时间');
    setStudentName('');
    setPhoneNumber('');
    setServiceIndex(0);
    setModalMode('lock');
  };

  const handleCloseModal = () => {
    setShowLockModal(false);
    resetForm();
  };

  // 处理手动创建（锁定或预约）
  const handleManualAction = async () => {
    try {
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
        const result = await Taro.cloud.callFunction({
          name: 'booking',
          data: {
            action: 'create',
            coachId: coachId,
            studentName,
            phoneNumber,
            serviceId: selectedService.id,
            serviceName: selectedService.name,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            status: 'confirmed'
          }
        });
        const res: any = result.result;
        if (res && res.ok) {
          fetchData(selectedDate);
          handleCloseModal();
          Taro.showToast({ title: '预约成功', icon: 'success' });
        } else {
          Taro.showToast({ title: res.message || '创建预约失败', icon: 'none' });
        }
      } else {
        Taro.showLoading({ title: '锁定中...' });
        const result = await Taro.cloud.callFunction({
          name: 'lock',
          data: {
            action: 'create',
            coachId: coachId,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            reason: lockReason
          }
        });

        const res: any = result.result;
        if (res && res.ok) {
          fetchData(selectedDate);
          handleCloseModal();
          Taro.showToast({ title: '已锁定时间', icon: 'success' });
        } else {
          Taro.showToast({ title: res.message || '创建锁定失败', icon: 'none' });
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      Taro.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      Taro.hideLoading();
    }
  };

  // 生成时间轴数据
  const generateTimelineData = () => {
    // 过滤出选中日期的 bookings 和 locks，并去重
    const dayItems = Array.from(new Map(
      bookings
        .filter((b) => dayjs(b.startTime).format('YYYY-MM-DD') === selectedDate)
        .map(item => [item.id, item])
    ).values()).sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());

    const timelineData: Array<any> = [];
    const periods = [
      { label: '上午', hour: 9, next: 13 },
      { label: '下午', hour: 13, next: 18 },
      { label: '晚上', hour: 18, next: 22 }
    ];

    periods.forEach(p => {
      timelineData.push({ type: 'period', label: p.label });

      const periodStart = dayjs(`${selectedDate} ${p.hour < 10 ? '0' + p.hour : p.hour}:00`);
      const periodEnd = dayjs(`${selectedDate} ${p.next}:00`);

      const periodItems = dayItems.filter(item => {
        const itemStart = dayjs(item.startTime);
        return (itemStart.isSame(periodStart) || itemStart.isAfter(periodStart)) && itemStart.isBefore(periodEnd);
      });

      if (periodItems.length === 0) {
        timelineData.push({ type: 'slot', time: periodStart.format('HH:mm') });
      } else {
        periodItems.forEach(item => {
          timelineData.push({
            type: item.isLocked ? 'locked' : 'booking',
            time: formatTime(item.startTime),
            booking: item,
            status: item.status,
            isLatest: dayjs(item.createdAt).isAfter(dayjs().subtract(1, 'hour'))
          });
        });
      }
    });

    timelineData.push({ type: 'period', label: '22:00' });
    return timelineData;
  };

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
                  onClick={() => handleDateSelect(date.date)}
                >
                  <Text className={`coach-nav-day ${date.isActive ? 'active' : ''}`}>
                    {date.day}
                  </Text>
                  <Text className={`coach-nav-date ${date.isActive ? 'active' : ''}`}>
                    {date.dayNumber}
                  </Text>
                  {date.isActive && <View className="coach-nav-active-indicator" />}
                </View>
              ))}
              <View className="coach-nav-scroll-end-spacer" />
            </View>
          </ScrollView>
          <View className="coach-nav-fade" />
        </View>
        <Picker
          mode="date"
          value={selectedDate}
          onChange={(e) => handleDateSelect(e.detail.value)}
        >
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
                  <Text className="material-symbols-outlined coach-alert-icon-symbol">pending_actions</Text>
                </View>
                <View className="coach-alert-text">
                  <Text className="coach-alert-title">{pendingCount}个新预约申请</Text>
                  <Text className="coach-alert-subtitle">请尽快处理待确认的申请</Text>
                </View>
              </View>
              <Button className="coach-alert-button">去处理</Button>
            </View>
          )}

          <View className="coach-section">
            <Text className="coach-section-title">今日日程 · {selectedDate}</Text>
            {loading && <Text className="coach-section-subtitle">同步中...</Text>}
          </View>

          <View className="coach-timeline">
            {generateTimelineData().map((item, index) => {
              if (item.type === 'period') {
                return (
                  <View key={index} className="coach-timeline-period">
                    <Text className="coach-timeline-period-label">{item.label}</Text>
                    <View className="coach-timeline-period-dot"></View>
                  </View>
                );
              }

              if (item.type === 'locked') {
                const booking = item.booking;
                return (
                  <View key={index} className="coach-timeline-item">
                    <View className="coach-timeline-time">
                      <Text className="coach-timeline-time-label">{item.time}</Text>
                      <View className="coach-timeline-time-dot"></View>
                    </View>
                    <View className="coach-timeline-content">
                      <View className="coach-booking-card locked">
                        <View className="coach-booking-header">
                          <View>
                            <Text className="coach-booking-type">私人时间 · 不接受预约</Text>
                            <Text className="coach-booking-title">已锁定</Text>
                          </View>
                          <Text className="material-symbols-outlined coach-booking-icon">lock</Text>
                        </View>
                        <View className="coach-booking-details">
                          <View className="coach-booking-detail">
                            <Text className="material-symbols-outlined text-sm">schedule</Text>
                            <Text>{formatTime(booking.startTime)} - {formatTime(booking.endTime)}</Text>
                          </View>
                        </View>
                        <View className="coach-booking-locked-hint">
                          <Text>{booking.lockReason || '手动锁定'}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              }

              if (item.type === 'slot') {
                const slotEnd = dayjs(`${selectedDate} ${item.time}`).add(60, 'minute').format('HH:mm');
                return (
                  <View key={index} className="coach-timeline-item">
                    <View className="coach-timeline-time">
                      <Text className="coach-timeline-time-label">{item.time}</Text>
                      <View className="coach-timeline-time-dot"></View>
                    </View>
                    <View className="coach-timeline-content">
                      <View className="coach-empty-slot">
                        <Text className="material-symbols-outlined text-xl">event_available</Text>
                        <Text className="coach-empty-slot-text">暂无安排</Text>
                        <Text className="coach-empty-slot-time">{item.time} - {slotEnd}</Text>
                      </View>
                    </View>
                  </View>
                );
              }

              if (item.type === 'booking') {
                const booking = item.booking;
                const isPending = item.status === 'pending';
                return (
                  <View key={index} className="coach-timeline-item">
                    <View className="coach-timeline-time">
                      <Text className="coach-timeline-time-label">{item.time}</Text>
                      <View className={`coach-timeline-time-dot ${isPending ? 'pending' : ''}`}></View>
                    </View>
                    <View className="coach-timeline-content">
                      <View className={`coach-booking-card ${item.status}`}>
                        <View className="coach-booking-header">
                          <View>
                            <Text className="coach-booking-type">{isPending ? '待处理申请' : booking.serviceName}</Text>
                            <Text className="coach-booking-title">学员: {booking.studentName}</Text>
                          </View>
                          {item.status === 'confirmed' && (
                            <Text className="material-symbols-outlined coach-booking-icon">verified</Text>
                          )}
                        </View>
                        <View className="coach-booking-details">
                          <View className="coach-booking-detail">
                            <Text className="material-symbols-outlined text-sm">schedule</Text>
                            <Text>{formatTime(booking.startTime)} - {formatTime(booking.endTime)}</Text>
                          </View>
                          {booking.phoneNumber && (
                            <View className="coach-booking-detail">
                              <Text className="material-symbols-outlined text-sm">call</Text>
                              <Text>{booking.phoneNumber}</Text>
                            </View>
                          )}
                        </View>
                        {isPending && (
                          <View className="coach-booking-actions">
                            <Button className="coach-booking-action reject" onClick={() => handleStatusUpdate(booking.id, 'cancelled')}>拒绝</Button>
                            <Button className="coach-booking-action approve" onClick={() => handleStatusUpdate(booking.id, 'confirmed')}>通过</Button>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              }
              return null;
            })}
          </View>
        </View>
      </ScrollView>

      <View className="coach-floating-button" onClick={() => setShowLockModal(true)}>
        <Text className="material-symbols-outlined coach-floating-icon">lock_open</Text>
      </View>

      {showLockModal && (
        <View className="coach-lock-modal-overlay">
          <View className="coach-lock-modal">
            <View className="coach-lock-modal-header">
              <View className="coach-lock-modal-tabs">
                <View
                  className={`coach-lock-modal-tab ${modalMode === 'lock' ? 'active' : ''}`}
                  onClick={() => setModalMode('lock')}
                >
                  锁定时间
                </View>
                <View
                  className={`coach-lock-modal-tab ${modalMode === 'booking' ? 'active' : ''}`}
                  onClick={() => setModalMode('booking')}
                >
                  手动代开
                </View>
              </View>
              <Text className="coach-lock-modal-close" onClick={handleCloseModal}>✕</Text>
            </View>
            <View className="coach-lock-modal-content">
              <View className="coach-lock-modal-form">
                <View className="coach-lock-modal-row">
                  <View className="coach-lock-modal-form-item flex-1">
                    <Text className="coach-lock-modal-form-label">开始时间</Text>
                    <Picker mode="time" value={lockStartTime} onChange={(e) => setLockStartTime(e.detail.value)}>
                      <View className="coach-lock-modal-picker">
                        <Text className="coach-lock-modal-picker-value">{lockStartTime}</Text>
                        <Text className="coach-lock-modal-picker-icon">▾</Text>
                      </View>
                    </Picker>
                  </View>
                  <View className="coach-lock-modal-form-item flex-1">
                    <Text className="coach-lock-modal-form-label">结束时间</Text>
                    <Picker mode="time" value={lockEndTime} onChange={(e) => setLockEndTime(e.detail.value)}>
                      <View className="coach-lock-modal-picker">
                        <Text className="coach-lock-modal-picker-value">{lockEndTime}</Text>
                        <Text className="coach-lock-modal-picker-icon">▾</Text>
                      </View>
                    </Picker>
                  </View>
                </View>

                {modalMode === 'lock' ? (
                  <View className="coach-lock-modal-form-item">
                    <Text className="coach-lock-modal-form-label">锁定原因</Text>
                    <Input
                      className="coach-lock-modal-form-input"
                      value={lockReason}
                      onInput={(e) => setLockReason(e.detail.value)}
                      placeholder="原因（如：私人安排）"
                    />
                  </View>
                ) : (
                  <>
                    <View className="coach-lock-modal-form-item">
                      <Text className="coach-lock-modal-form-label">学员资料</Text>
                      <View className="coach-lock-modal-input-group">
                        <Input
                          className="coach-lock-modal-form-input"
                          value={studentName}
                          onInput={(e) => setStudentName(e.detail.value)}
                          placeholder="学员姓名"
                        />
                        <Input
                          className="coach-lock-modal-form-input"
                          type="number"
                          value={phoneNumber}
                          onInput={(e) => setPhoneNumber(e.detail.value)}
                          placeholder="电话号码（选填）"
                        />
                      </View>
                    </View>
                    <View className="coach-lock-modal-form-item">
                      <Text className="coach-lock-modal-form-label">选择课程</Text>
                      <Picker
                        mode="selector"
                        range={services.map(s => s.name)}
                        value={serviceIndex}
                        onChange={(e) => setServiceIndex(Number(e.detail.value))}
                      >
                        <View className="coach-lock-modal-picker">
                          <Text className="coach-lock-modal-picker-value">{services[serviceIndex]?.name || '请选择课程'}</Text>
                          <Text className="coach-lock-modal-picker-icon">▾</Text>
                        </View>
                      </Picker>
                    </View>
                  </>
                )}
              </View>
            </View>
            <View className="coach-lock-modal-actions">
              <Button className="coach-lock-modal-button confirm" onClick={handleManualAction}>
                {modalMode === 'lock' ? '确认锁定' : '立即创建预约'}
              </Button>
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
