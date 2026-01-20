const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const toDate = (value) => {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
};

const assertRequired = (data, keys) => {
  const missing = keys.filter((key) => data[key] === undefined || data[key] === null || data[key] === '');
  if (missing.length) {
    throw new Error(`Missing fields: ${missing.join(', ')}`);
  }
};

const getDayRange = (dateString) => {
  const start = new Date(`${dateString}T00:00:00.000Z`);
  const end = new Date(`${dateString}T23:59:59.999Z`);
  return { start, end };
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action;

  try {
    if (action === 'create') {
      assertRequired(event, ['coachId', 'serviceId', 'serviceName', 'startTime', 'endTime']);
      const coachId = event.coachId;
      const studentId = event.studentId || OPENID;
      const start = toDate(event.startTime);
      const end = toDate(event.endTime);

      const overlappingBookings = await db.collection('bookings').where({
        coachId,
        status: _.neq('cancelled'),
        startTime: _.lt(end),
        endTime: _.gt(start),
      }).get();

      const overlappingLocks = await db.collection('locks').where({
        coachId,
        startTime: _.lt(end),
        endTime: _.gt(start),
      }).get();

      if (overlappingBookings.data.length || overlappingLocks.data.length) {
        return { ok: false, message: '当前时间段已被占用' };
      }

      const payload = {
        coachId,
        studentId,
        studentName: event.studentName || '学员',
        phoneNumber: event.phoneNumber || '',
        serviceId: event.serviceId,
        serviceName: event.serviceName,
        startTime: start,
        endTime: end,
        status: event.status || 'pending',
        bufferTime: event.bufferTime || 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const res = await db.collection('bookings').add({ data: payload });
      return { ok: true, id: res._id };
    }

    if (action === 'updateStatus') {
      assertRequired(event, ['bookingId', 'status']);
      await db.collection('bookings').doc(event.bookingId).update({
        data: {
          status: event.status,
          updatedAt: new Date(),
        },
      });
      return { ok: true };
    }

    if (action === 'listByDate') {
      assertRequired(event, ['coachId', 'date']);
      const { start, end } = getDayRange(event.date);
      const res = await db.collection('bookings').where({
        coachId: event.coachId,
        startTime: _.gte(start),
        startTime: _.lt(end),
      }).get();
      return { ok: true, data: res.data };
    }

    if (action === 'deduct') {
      assertRequired(event, ['studentId', 'hours']);
      const { studentId, hours } = event;

      const studentRes = await db.collection('students').doc(studentId).get();
      if (!studentRes.data) return { ok: false, message: '学员不存在' };

      const student = studentRes.data;
      if (student.remainingHours < hours) {
        return { ok: false, message: '课时余额不足' };
      }

      await db.collection('students').doc(studentId).update({
        data: {
          remainingHours: _.inc(-hours),
          updatedAt: new Date(),
        },
      });

      return { ok: true, remainingHours: student.remainingHours - hours };
    }

    if (action === 'getCoach') {
      assertRequired(event, ['coachId']);
      const res = await db.collection('coaches').doc(event.coachId).get();
      if (!res.data) {
        // 如果不存在，返回默认值
        return {
          ok: true,
          data: {
            _id: event.coachId,
            name: '未命名教练',
            settings: {
              bufferTime: 15,
              minAdvanceHours: 4,
              maxFutureDays: 14,
              autoAccept: false,
              allowCancelWithin24h: false,
              dailyLimitEnabled: true,
              services: []
            }
          }
        };
      }
      return { ok: true, data: res.data };
    }

    if (action === 'updateCoach') {
      assertRequired(event, ['coachId', 'settings']);
      // 使用 set 以确保即使不存在也能创建/更新全量配置
      await db.collection('coaches').doc(event.coachId).set({
        data: {
          settings: event.settings,
          updatedAt: new Date(),
        },
      });
      return { ok: true };
    }

    return { ok: false, message: 'Unknown action' };
  } catch (error) {
    return { ok: false, message: error.message || 'Server error' };
  }
};
