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
      assertRequired(event, ['coachId', 'startTime', 'endTime']);
      const coachId = event.coachId || OPENID;
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
        startTime: start,
        endTime: end,
        reason: event.reason || '私人时间',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const res = await db.collection('locks').add({ data: payload });
      return { ok: true, id: res._id };
    }

    if (action === 'remove') {
      assertRequired(event, ['lockId']);
      await db.collection('locks').doc(event.lockId).remove();
      return { ok: true };
    }

    if (action === 'listByDate') {
      assertRequired(event, ['coachId', 'date']);
      const { start, end } = getDayRange(event.date);
      const res = await db.collection('locks').where({
        coachId: event.coachId,
        startTime: _.gte(start),
        startTime: _.lt(end),
      }).get();
      return { ok: true, data: res.data };
    }

    return { ok: false, message: 'Unknown action' };
  } catch (error) {
    return { ok: false, message: error.message || 'Server error' };
  }
};
