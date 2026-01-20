import React, { useState } from 'react';
import { View, Text, ScrollView, Button } from '@tarojs/components';
import dayjs from 'dayjs';
import { Service, TimeSlot } from '../../types';
import { formatTime, generateTimeSlots } from '../utils';
import { useStore } from '../store';
import './Calendar.css';

interface CalendarProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  selectedService: Service | null;
  onTimeSlotSelect: (slot: TimeSlot) => void;
}

const Calendar: React.FC<CalendarProps> = ({
  selectedDate,
  onDateChange,
  selectedService,
  onTimeSlotSelect,
}) => {
  const { coachSettings, bookings, tempBookings } = useStore();
  const [currentMonth, setCurrentMonth] = useState(dayjs().month());
  const [currentYear, setCurrentYear] = useState(dayjs().year());

  // 生成月份的所有日期
  const generateDays = () => {
    const days = [];
    const firstDay = dayjs(`${currentYear}-${currentMonth + 1}-01`);
    const lastDay = firstDay.endOf('month');
    const startDate = firstDay.startOf('week');
    const endDate = lastDay.endOf('week');

    let currentDate = startDate;
    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
      days.push(currentDate.toISOString());
      currentDate = currentDate.add(1, 'day');
    }

    return days;
  };

  // 检查日期是否可预约
  const isDateBookable = (date: string) => {
    const targetDate = dayjs(date);
    const now = dayjs();
    const maxFutureDate = now.add(coachSettings.maxFutureDays, 'day');

    return targetDate.isAfter(now) || targetDate.isSame(now, 'day');
  };

  // 生成时间槽
  const timeSlots = selectedService
    ? generateTimeSlots(selectedDate, selectedService.duration, coachSettings, bookings, tempBookings)
    : [];

  return (
    <View className="calendar-container">
      {/* 月份导航 */}
      <View className="calendar-header">
        <View className="calendar-nav">
          <Button 
            className="calendar-nav-button"
            onClick={() => {
              if (currentMonth === 0) {
                setCurrentMonth(11);
                setCurrentYear(currentYear - 1);
              } else {
                setCurrentMonth(currentMonth - 1);
              }
            }}
          >
            <Text>←</Text>
          </Button>
        </View>
        <Text className="calendar-title">
          {currentYear}年{currentMonth + 1}月
        </Text>
        <View className="calendar-nav">
          <Button 
            className="calendar-nav-button"
            onClick={() => {
              if (currentMonth === 11) {
                setCurrentMonth(0);
                setCurrentYear(currentYear + 1);
              } else {
                setCurrentMonth(currentMonth + 1);
              }
            }}
          >
            <Text>→</Text>
          </Button>
        </View>
      </View>

      {/* 星期标题 */}
      <View className="calendar-weekdays">
        {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
          <Text key={day} className="calendar-weekday">{day}</Text>
        ))}
      </View>

      {/* 日期网格 */}
      <View className="calendar-days">
        {generateDays().map((date, index) => {
          const dateObj = dayjs(date);
          const isSelected = dateObj.format('YYYY-MM-DD') === dayjs(selectedDate).format('YYYY-MM-DD');
          const isBookable = isDateBookable(date);
          const isCurrentMonth = dateObj.month() === currentMonth;

          return (
            <View
              key={date}
              className={`calendar-day ${isSelected ? 'selected' : ''} ${isBookable ? 'bookable' : ''} ${isCurrentMonth ? 'current-month' : ''}`}
              onClick={() => isBookable && onDateChange(date)}
            >
              <Text>{dateObj.date()}</Text>
            </View>
          );
        })}
      </View>

      {/* 时间槽选择 */}
      {selectedService && (
        <View className="calendar-time-slots">
          <Text className="calendar-time-slots-title">
            可预约时间 ({selectedService.name} - {selectedService.duration}分钟)
          </Text>
          <ScrollView className="calendar-time-slots-container">
            <View className="calendar-time-slots-grid">
              {timeSlots.map((slot) => (
                <View
                  key={slot.start}
                  className={`calendar-time-slot ${slot.available ? 'available' : ''}`}
                  onClick={() => slot.available && onTimeSlotSelect(slot)}
                >
                  <Text>{formatTime(slot.start)} - {formatTime(slot.end)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
};

export default Calendar;
