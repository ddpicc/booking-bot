const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext();
    const action = event.action;

    try {
        if (action === 'list') {
            // 获取当前教练绑定的所有学员
            // 注意：在多教练场景下，系统会根据身份识别教练 ID
            const coachId = event.coachId || 'coach';
            const res = await db.collection('students').where({
                coachId: coachId
            }).get();
            return { ok: true, data: res.data };
        }

        if (action === 'getProfile') {
            const res = await db.collection('students').where({
                openid: OPENID
            }).get();
            return { ok: true, data: res.data[0] || null };
        }

        if (action === 'create') {
            const studentData = event.data;
            const coachId = event.coachId || 'COACH_88888';
            const payload = {
                ...studentData,
                coachId: coachId,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const res = await db.collection('students').add({ data: payload });
            return { ok: true, id: res._id };
        }

        return { ok: false, message: 'Unknown action' };
    } catch (error) {
        return { ok: false, message: error.message || 'Server error' };
    }
};
