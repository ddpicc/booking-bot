import { useMemo, useState, useEffect, useCallback } from 'react';
import { Booking, CoachSettings, Service, User, Student } from '../types';

// 定义状态类型
interface AppState {
  currentUser: User | null;
  coachSettings: CoachSettings;
  bookings: Booking[];
  tempBookings: Booking[];
  services: Service[];
  students: Student[];
}

// 定义动作类型
type AppAction =
  | { type: 'SET_CURRENT_USER'; payload: User | null }
  | { type: 'UPDATE_COACH_SETTINGS'; payload: Partial<CoachSettings> }
  | { type: 'ADD_BOOKING'; payload: Booking }
  | { type: 'SET_BOOKINGS'; payload: Booking[] }
  | { type: 'UPDATE_BOOKING_STATUS'; payload: { id: string; status: Booking['status'] } }
  | { type: 'DELETE_BOOKING'; payload: string }
  | { type: 'ADD_TEMP_BOOKING'; payload: Booking }
  | { type: 'REMOVE_TEMP_BOOKING'; payload: string }
  | { type: 'ADD_SERVICE'; payload: Service }
  | { type: 'UPDATE_SERVICE'; payload: { id: string; service: Partial<Service> } }
  | { type: 'DELETE_SERVICE'; payload: string }
  | { type: 'SET_SERVICES'; payload: Service[] }
  | { type: 'SET_COACH_SETTINGS'; payload: CoachSettings }
  | { type: 'SET_STUDENTS'; payload: Student[] }
  | { type: 'ADD_STUDENT'; payload: Student }
  | { type: 'UPDATE_STUDENT'; payload: { id: string; student: Partial<Student> } }
  | { type: 'DELETE_STUDENT'; payload: string };

// 默认服务
const defaultServices: Service[] = [
  { id: '1', name: '基础课', duration: 60 },
  { id: '2', name: '进阶课', duration: 90 },
];

// 默认设置
const defaultSettings: CoachSettings = {
  bufferTime: 15,
  minAdvanceHours: 4,
  maxFutureDays: 14,
  autoAccept: false,
  allowCancelWithin24h: false,
  dailyLimitEnabled: true,
  defaultServiceDuration: 60,
  services: defaultServices,
  workingHours: {
    monday: { start: '09:00', end: '18:00' },
    tuesday: { start: '09:00', end: '18:00' },
    wednesday: { start: '09:00', end: '18:00' },
    thursday: { start: '09:00', end: '18:00' },
    friday: { start: '09:00', end: '18:00' },
    saturday: { start: '10:00', end: '16:00' },
    sunday: null,
  },
};

// 初始状态
let state: AppState = {
  currentUser: null,
  coachSettings: defaultSettings,
  bookings: [],
  tempBookings: [],
  services: defaultServices,
  students: [
    {
      id: 'st-1',
      name: '张伟',
      phoneNumber: '13800138000',
      courseName: '青少年羽毛球基础班',
      remainingHours: 12,
      totalHours: 20,
      sportType: '羽毛球',
      avatar: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=100'
    },
    {
      id: 'st-2',
      name: '李娜',
      phoneNumber: '13911112222',
      courseName: '成人网球进阶班',
      remainingHours: 2,
      totalHours: 10,
      sportType: '网球',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=100'
    },
    {
      id: 'st-3',
      name: '王小明',
      phoneNumber: '13788889999',
      courseName: '儿童自由泳班',
      remainingHours: 1,
      totalHours: 30,
      sportType: '游泳',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100'
    },
    {
      id: 'st-4',
      name: '陈杰',
      phoneNumber: '13655554444',
      courseName: '篮球一对一',
      remainingHours: 3,
      totalHours: 15,
      sportType: '篮球',
      avatar: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&q=80&w=100'
    }
  ],
};

// 监听器列表
let listeners: Array<() => void> = [];

// Reducer 函数
const appReducer = (currentState: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_CURRENT_USER':
      return { ...currentState, currentUser: action.payload };

    case 'UPDATE_COACH_SETTINGS':
      return {
        ...currentState,
        coachSettings: { ...currentState.coachSettings, ...action.payload },
      };

    case 'ADD_BOOKING':
      return { ...currentState, bookings: [...currentState.bookings, action.payload] };

    case 'SET_BOOKINGS':
      return { ...currentState, bookings: action.payload };

    case 'UPDATE_BOOKING_STATUS':
      return {
        ...currentState,
        bookings: currentState.bookings.map((booking) =>
          booking.id === action.payload.id
            ? { ...booking, status: action.payload.status }
            : booking
        ),
      };

    case 'DELETE_BOOKING':
      return {
        ...currentState,
        bookings: currentState.bookings.filter((booking) => booking.id !== action.payload),
      };

    case 'ADD_TEMP_BOOKING':
      return { ...currentState, tempBookings: [...currentState.tempBookings, action.payload] };

    case 'REMOVE_TEMP_BOOKING':
      return {
        ...currentState,
        tempBookings: currentState.tempBookings.filter((booking) => booking.id !== action.payload),
      };

    case 'ADD_SERVICE':
      return { ...currentState, services: [...currentState.services, action.payload] };

    case 'UPDATE_SERVICE':
      return {
        ...currentState,
        services: currentState.services.map((service) =>
          service.id === action.payload.id
            ? { ...service, ...action.payload.service }
            : service
        ),
      };

    case 'DELETE_SERVICE':
      return {
        ...currentState,
        services: currentState.services.filter((service) => service.id !== action.payload),
      };

    case 'SET_SERVICES':
      return { ...currentState, services: action.payload };
    case 'SET_COACH_SETTINGS':
      return { ...currentState, coachSettings: action.payload };

    case 'SET_STUDENTS':
      return { ...currentState, students: action.payload };

    case 'ADD_STUDENT':
      return { ...currentState, students: [action.payload, ...currentState.students] };

    case 'UPDATE_STUDENT':
      return {
        ...currentState,
        students: currentState.students.map((student) =>
          student.id === action.payload.id
            ? { ...student, ...action.payload.student }
            : student
        ),
      };

    case 'DELETE_STUDENT':
      return {
        ...currentState,
        students: currentState.students.filter((student) => student.id !== action.payload),
      };

    default:
      return currentState;
  }
};

// 状态更新函数
const setState = (action: AppAction) => {
  state = appReducer(state, action);
  listeners.forEach(listener => listener());
};

// 订阅函数
const subscribe = (listener: () => void) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
};

// 导出的 store API
export const useStore = () => {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return subscribe(() => forceUpdate({}));
  }, []);

  // Memoize action dispatchers
  const setCurrentUser = useCallback((user: User | null) => setState({ type: 'SET_CURRENT_USER', payload: user }), []);
  const updateCoachSettings = useCallback((settings: Partial<CoachSettings>) =>
    setState({ type: 'UPDATE_COACH_SETTINGS', payload: settings }), []);
  const addBooking = useCallback((booking: Booking) => setState({ type: 'ADD_BOOKING', payload: booking }), []);
  const setBookings = useCallback((bookings: Booking[]) => setState({ type: 'SET_BOOKINGS', payload: bookings }), []);
  const updateBookingStatus = useCallback((id: string, status: Booking['status']) =>
    setState({ type: 'UPDATE_BOOKING_STATUS', payload: { id, status } }), []);
  const deleteBooking = useCallback((id: string) => setState({ type: 'DELETE_BOOKING', payload: id }), []);
  const addTempBooking = useCallback((booking: Booking) => setState({ type: 'ADD_TEMP_BOOKING', payload: booking }), []);
  const removeTempBooking = useCallback((id: string) => setState({ type: 'REMOVE_TEMP_BOOKING', payload: id }), []);
  const addService = useCallback((service: Service) => setState({ type: 'ADD_SERVICE', payload: service }), []);
  const updateService = useCallback((id: string, service: Partial<Service>) =>
    setState({ type: 'UPDATE_SERVICE', payload: { id, service } }), []);
  const deleteService = useCallback((id: string) => setState({ type: 'DELETE_SERVICE', payload: id }), []);
  const setStudents = useCallback((students: Student[]) => setState({ type: 'SET_STUDENTS', payload: students }), []);
  const setServices = useCallback((services: Service[]) => setState({ type: 'SET_SERVICES', payload: services }), []);
  const setCoachSettings = useCallback((settings: CoachSettings) => setState({ type: 'SET_COACH_SETTINGS', payload: settings }), []);
  const addStudent = useCallback((student: Student) => setState({ type: 'ADD_STUDENT', payload: student }), []);
  const updateStudent = useCallback((id: string, student: Partial<Student>) =>
    setState({ type: 'UPDATE_STUDENT', payload: { id, student } }), []);
  const deleteStudent = useCallback((id: string) => setState({ type: 'DELETE_STUDENT', payload: id }), []);


  return useMemo(() => ({
    currentUser: state.currentUser,
    setCurrentUser,

    coachSettings: state.coachSettings,
    updateCoachSettings,
    setCoachSettings,

    bookings: state.bookings,
    addBooking,
    setBookings,
    updateBookingStatus,
    deleteBooking,

    tempBookings: state.tempBookings,
    addTempBooking,
    removeTempBooking,

    services: state.services,
    setServices,
    addService,
    updateService,
    deleteService,

    students: state.students,
    setStudents,
    addStudent,
    updateStudent,
    deleteStudent,

    subscribe,
  }), [
    state.currentUser,
    state.coachSettings,
    state.bookings,
    state.tempBookings,
    state.services,
    state.students,
    setCurrentUser,
    updateCoachSettings,
    addBooking,
    setBookings,
    updateBookingStatus,
    deleteBooking,
    addTempBooking,
    removeTempBooking,
    addService,
    updateService,
    deleteService,
    setStudents,
    addStudent,
    updateStudent,
    deleteStudent,
  ]);
};

// 导出状态和操作（如果需要直接访问）
export { state, setState, subscribe };
