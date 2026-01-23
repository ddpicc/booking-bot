import dayjs from 'dayjs';
import Taro from '@tarojs/taro';
import { Booking, CoachSettings, TimeSlot } from '../types';

// 生成唯一ID
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// 计算给定日期的可预约时间槽
export const generateTimeSlots = (
  date: string,
  duration: number,
  settings: CoachSettings,
  bookings: Booking[],
  tempBookings: Booking[]
): TimeSlot[] => {
  const slots: TimeSlot[] = [];
  const targetDate = dayjs(date);
  const dayOfWeek = targetDate.format('dddd').toLowerCase();

  // 检查是否在工作日
  const workingHours = settings.workingHours[dayOfWeek as keyof typeof settings.workingHours];
  if (!workingHours) return slots;

  const startHour = parseInt(workingHours.start.split(':')[0]);
  const startMinute = parseInt(workingHours.start.split(':')[1]);
  const endHour = parseInt(workingHours.end.split(':')[0]);
  const endMinute = parseInt(workingHours.end.split(':')[1]);

  let currentTime = targetDate.hour(startHour).minute(startMinute);
  const endTime = targetDate.hour(endHour).minute(endMinute);

  // 合并所有已预约的时间（包括临时预约）
  const allBookings = [...bookings, ...tempBookings];

  while (currentTime.isBefore(endTime)) {
    const slotEndTime = currentTime.add(duration, 'minute');
    if (slotEndTime.isAfter(endTime)) break;

    // 检查是否与已预约时间冲突
    const isAvailable = !allBookings.some((booking) => {
      const bookingStart = dayjs(booking.startTime);
      const bookingEnd = dayjs(booking.endTime);

      // 计算缓冲时间后的结束时间
      const bookingEndWithBuffer = bookingEnd.add(booking.bufferTime || settings.bufferTime, 'minute');

      return (
        (currentTime.isAfter(bookingStart) && currentTime.isBefore(bookingEndWithBuffer)) ||
        (slotEndTime.isAfter(bookingStart) && slotEndTime.isBefore(bookingEndWithBuffer)) ||
        (currentTime.isBefore(bookingStart) && slotEndTime.isAfter(bookingEndWithBuffer))
      );
    });

    slots.push({
      start: currentTime.toISOString(),
      end: slotEndTime.toISOString(),
      available: isAvailable,
    });

    currentTime = currentTime.add(30, 'minute'); // 每30分钟一个时间槽
  }

  return slots;
};

// 检查预约是否符合规则
export const validateBooking = (
  startTime: string,
  settings: CoachSettings
): { valid: boolean; message?: string } => {
  const now = dayjs();
  const bookingTime = dayjs(startTime);

  // 检查提前量
  const advanceHours = bookingTime.diff(now, 'hour');
  if (advanceHours < settings.minAdvanceHours) {
    return {
      valid: false,
      message: `请至少提前 ${settings.minAdvanceHours} 小时预约`,
    };
  }

  // 检查开放窗口
  const futureDays = bookingTime.diff(now, 'day');
  if (futureDays > settings.maxFutureDays) {
    return {
      valid: false,
      message: `最多只能预约未来 ${settings.maxFutureDays} 天的服务`,
    };
  }

  return { valid: true };
};

// 格式化时间为 HH:mm
export const formatTime = (timeString: string): string => {
  return dayjs(timeString).format('HH:mm');
};

// 格式化日期为 YYYY-MM-DD
export const formatDate = (dateString: string): string => {
  return dayjs(dateString).format('YYYY-MM-DD');
};

// 获取今天开始时间
export const getTodayStart = (): string => {
  return dayjs().startOf('day').toISOString();
};

// 获取今天结束时间
export const getTodayEnd = (): string => {
  return dayjs().endOf('day').toISOString();
};
// 统一调用云托管的封装
export const callCloudContainer = async (path: string, data: any = {}) => {
  console.log(`[Cloud] Request: ${path}`, data);
  try {
    const res = await Taro.cloud.callContainer({
      path,
      method: 'POST',
      header: {
        'X-WX-SERVICE': 'booking-bot',
      },
      data,
    });
    console.log(`[Cloud] Response: ${path}`, res);
    return res;
  } catch (e) {
    console.error(`[Cloud] Error: ${path}`, e);
    throw e;
  }
};

// 兼容原有的业务调用逻辑
export const callService = async (service: string, action: string, data: any = {}) => {
  const res = await callCloudContainer('/api/call', { service, action, data });
  // 统一返回格式，兼容 callFunction 返回 result 的情况
  const normalized = (res && (res as any).data !== undefined)
    ? (res as any).data
    : (res as any).result;
  return {
    ...res,
    data: normalized,
  };
};
