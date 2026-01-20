export interface Service {
  id: string;
  name: string;
  duration: number; // 分钟
  hasGap?: boolean; // 是否有课间休息
  price?: number;
  description?: string;
}

export interface Booking {
  id: string;
  studentId: string;
  studentName: string;
  phoneNumber?: string;
  serviceId: string;
  serviceName: string;
  startTime: string; // ISO 时间字符串
  endTime: string; // ISO 时间字符串
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string; // ISO 时间字符串
  bufferTime?: number; // 分钟
  isLocked?: boolean;
  lockReason?: string;
}

export interface CoachSettings {
  bufferTime: number; // 分钟
  minAdvanceHours: number; // 最少提前预约小时数
  maxFutureDays: number; // 最多开放未来天数
  services: Service[];
  autoAccept?: boolean; // 自动接受预约
  allowCancelWithin24h?: boolean; // 允许24小时内取消
  dailyLimitEnabled?: boolean; // 每日接单上限开关
  defaultServiceDuration?: number; // 默认课程时长
  workingHours: {
    monday: { start: string; end: string } | null;
    tuesday: { start: string; end: string } | null;
    wednesday: { start: string; end: string } | null;
    thursday: { start: string; end: string } | null;
    friday: { start: string; end: string } | null;
    saturday: { start: string; end: string } | null;
    sunday: { start: string; end: string } | null;
  };
}

export interface User {
  id: string;
  name: string;
  avatar?: string;
  role: 'coach';
}

export interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
  bookingId?: string;
  status?: Booking['status'];
}

export interface Student {
  _id?: string;
  id?: string;
  name: string;
  phoneNumber: string;
  avatar?: string;
  courseName: string;
  remainingHours: number;
  totalHours: number;
  unitPrice?: number;
  sportType: string; // 羽毛球, 网球 etc.
  lastBookingDate?: string;
  coachId?: string;
}
