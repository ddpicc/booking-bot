const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cloudbase = require("@cloudbase/node-sdk");
const axios = require('axios');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 初始化云开发 SDK (数据模型模式)
const cloud = cloudbase.init({
    env: 'cloud1-8go2n6w41a48657b',
    secretId: "AKIDjMzVpxtcIuWwAF8oKelfT6XmphNtGRTy",
    secretKey: "X9pOlvscCZmmaBZljU2NWTKl6HI80iGh",
});
const db = cloud.database({
    instance: "flexdb",
    database: "tnt-20omv8uou",
});
const _ = db.command;

// 中间件：日志打印
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- 配置集 ---
const API_KEY = 'sk-M9dAAx2KVKwC0b73XT7XRpyMbMs37Z1jIAqyKPwkjDeeR3ez';
const API_URL = 'https://www.dmxapi.cn/v1/chat/completions';
const MODEL = 'GLM-4.5-Flash';

// --- 工具函数 ---
function formatLocalTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const offset = 8;
    const localDate = new Date(d.getTime() + offset * 3600 * 1000);
    return localDate.toISOString().substr(11, 5);
}

const toDate = (value) => {
    if (!value) return null;
    return value instanceof Date ? value : new Date(value);
};

const getDayRange = (dateString) => {
    const start = new Date(`${dateString}T00:00:00.000+08:00`);
    const end = new Date(`${dateString}T23:59:59.999+08:00`);
    return { start, end };
};

// --- AI 助手核心逻辑 ---
async function handleToolCall(toolCall, coachId, openId) {
    const { name, arguments: argsString } = toolCall.function;
    let args = JSON.parse(argsString);

    if (name === 'get_student_profile') {
        const studentRes = await db.collection('users').where({ openid: openId }).get();
        if (studentRes.data.length === 0) return JSON.stringify({ ok: false, message: '未找到学员信息' });
        const student = studentRes.data[0];
        let coachName = '未知';
        if (student.coachId) {
            const coachRes = await db.collection('coach_settings').doc(student.coachId).get();
            if (coachRes.data) coachName = coachRes.data.name;
        }
        return JSON.stringify({
            ok: true,
            studentName: student.name,
            remainingHours: student.remainingHours,
            boundCoachId: student.coachId,
            boundCoachName: coachName
        });
    }

    if (!coachId || coachId === 'coach') {
        return JSON.stringify({ ok: false, message: '请先告知我是哪位教练（姓名或 ID）。' });
    }

    if (name === 'get_available_slots') {
        const { date } = args;
        const { start, end } = getDayRange(date);
        const bookings = await db.collection('bookings').where({
            coachId, status: _.neq('cancelled'), startTime: _.gte(start).and(_.lt(end))
        }).get();
        const locks = await db.collection('locks').where({
            coachId, startTime: _.gte(start).and(_.lt(end))
        }).get();

        return JSON.stringify({
            date,
            existing_bookings: bookings.data.map(b => `${formatLocalTime(start)}-${formatLocalTime(end)} (${b.serviceName})`),
            locks: locks.data.map(l => `${formatLocalTime(l.startTime)}-${formatLocalTime(l.endTime)} (锁定: ${l.reason || '无原因'})`)
        });
    }

    if (name === 'create_booking_request') {
        const { date, startTime, endTime, studentName, serviceName } = args;
        const start = new Date(`${date}T${startTime}:00.000+08:00`);
        const end = new Date(`${date}T${endTime}:00.000+08:00`);

        // 校验重叠
        const overlapBookings = await db.collection('bookings').where({
            coachId, status: _.neq('cancelled'), startTime: _.lt(end), endTime: _.gt(start)
        }).get();
        const overlapLocks = await db.collection('locks').where({
            coachId, startTime: _.lt(end), endTime: _.gt(start)
        }).get();

        if (overlapBookings.data.length || overlapLocks.data.length) {
            return JSON.stringify({ ok: false, message: '该时间段已被占用或锁定。' });
        }

        const res = await db.collection('bookings').add({
            data: {
                coachId, studentId: openId, studentName, serviceName: serviceName || 'AI 预约',
                startTime: start, endTime: end, status: 'pending', createdAt: new Date()
            }
        });
        return JSON.stringify({ ok: true, bookingId: res._id });
    }
    return 'Unknown tool';
}

// AI 助手接口
app.post('/api/assistant', async (req, res) => {
    const { messages, currentDate, coachId: inputCoachId, coachName: mentionedCoachName } = req.body;
    const OPENID = req.headers['x-wx-openid'] || 'TEST_WEB_USER';

    let effectiveCoachId = inputCoachId;
    let studentInfo = null;

    try {
        // 1. 获取学员与教练绑定关系
        const studentRes = await db.collection('users').where({ openid: OPENID }).get();
        if (studentRes.data.length > 0) {
            studentInfo = studentRes.data[0];
            if (!effectiveCoachId || effectiveCoachId === 'coach') effectiveCoachId = studentInfo.coachId;
        }

        // 2. 姓名模糊匹配
        if (mentionedCoachName) {
            const coachMatch = await db.collection('coach_settings').where({
                name: { $regex: mentionedCoachName, $options: 'i' }
            }).get();
            if (coachMatch.data.length === 1) effectiveCoachId = coachMatch.data[0]._id;
        }

        const systemPrompt = `你是一个专业的体育预约助手。当前北京时间：${currentDate || new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}。
学员信息：${studentInfo ? studentInfo.name : '未知'}(余额:${studentInfo ? studentInfo.remainingHours : 0})。
教练信息：${effectiveCoachId || 'test_coach_001'}。
【规则】
1. 预约前必须通过 get_available_slots 检查冲突。
2. 若无法定位教练，优先通过 get_student_profile 确认，否则询问用户。
3. 余额不足 0 时禁止预约。`;

        const response = await axios.post(API_URL, {
            model: MODEL,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            tools: [
                { type: 'function', function: { name: 'get_student_profile', description: '获取学员资料' } },
                { type: 'function', function: { name: 'get_available_slots', parameters: { type: 'object', properties: { date: { type: 'string' } } } } },
                { type: 'function', function: { name: 'create_booking_request', parameters: { type: 'object', properties: { date: { type: 'string' }, startTime: { type: 'string' }, endTime: { type: 'string' }, studentName: { type: 'string' }, serviceName: { type: 'string' } } } } }
            ],
            tool_choice: 'auto'
        }, { headers: { 'Authorization': `Bearer ${API_KEY}` } });

        let message = response.data.choices[0].message;
        if (message.tool_calls) {
            for (const toolCall of message.tool_calls) {
                const result = await handleToolCall(toolCall, effectiveCoachId || 'test_coach_001', OPENID);
                // 简化处理：这里直接反馈工具结果
                message.content = `[工具调用结果: ${result}]`;
            }
        }
        res.json({ ok: true, reply: message.content });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// 统一业务接口
app.post('/api/call', async (req, res) => {
    const { service, action, data } = req.body;
    const OPENID = req.headers['x-wx-openid'] || 'TEST_WEB_USER';

    try {
        if (service === 'students') {
            if (action === 'list') {
                const result = await db.collection('users').where({ coachId: data.coachId || 'test_coach_001' }).get();
                return res.json({ ok: true, data: result.data });
            }
            if (action === 'create') {
                const result = await db.collection('users').add({ data: { ...data, createdAt: new Date() } });
                return res.json({ ok: true, id: result._id });
            }
            if (action === 'getProfile') {
                const result = await db.collection('users').where({ openid: OPENID }).get();
                return res.json({ ok: true, data: result.data[0] || null });
            }
        }
        if (service === 'lock') {
            if (action === 'listByDate') {
                const { start, end } = getDayRange(data.date);
                const result = await db.collection('locks').where({
                    coachId: data.coachId,
                    startTime: _.gte(start).and(_.lt(end))
                }).get();
                return res.json({ ok: true, data: result.data });
            }
            if (action === 'create') {
                const start = toDate(data.startTime);
                const end = toDate(data.endTime);
                const result = await db.collection('locks').add({
                    data: {
                        ...data,
                        startTime: start,
                        endTime: end,
                        createdAt: new Date()
                    }
                });
                return res.json({ ok: true, id: result._id });
            }
        }
        if (service === 'booking') {
            if (action === 'create') {
                const start = toDate(data.startTime);
                const end = toDate(data.endTime);
                const coachId = data.coachId;

                // 统一校验重叠 (手动创建也检查)
                const overlapBookings = await db.collection('bookings').where({
                    coachId, status: _.neq('cancelled'), startTime: _.lt(end), endTime: _.gt(start)
                }).get();
                const overlapLocks = await db.collection('locks').where({
                    coachId, startTime: _.lt(end), endTime: _.gt(start)
                }).get();

                if (overlapBookings.data.length || overlapLocks.data.length) {
                    return res.json({ ok: false, message: '该时间段已被占用或锁定' });
                }

                const result = await db.collection('bookings').add({
                    data: {
                        ...data,
                        studentId: data.studentId || OPENID, // 优先使用传参中的学员 ID
                        startTime: start,
                        endTime: end,
                        createdAt: new Date()
                    }
                });
                return res.json({ ok: true, id: result._id });
            }
            if (action === 'listByDate') {
                const { start, end } = getDayRange(data.date);
                const result = await db.collection('bookings').where({ coachId: data.coachId, startTime: _.gte(start).and(_.lt(end)) }).get();
                return res.json({ ok: true, data: result.data });
            }
            if (action === 'updateStatus') {
                await db.collection('bookings').doc(data.bookingId).update({ data: { status: data.status, updatedAt: new Date() } });
                return res.json({ ok: true });
            }
            if (action === 'deduct') {
                await db.collection('users').doc(data.studentId).update({ data: { remainingHours: _.inc(-data.hours) } });
                return res.json({ ok: true });
            }
            if (action === 'getCoach') {
                const result = await db.collection('coach_settings').doc(data.coachId).get();
                return res.json({ ok: true, data: result.data });
            }
        }
        res.status(400).json({ ok: false, message: 'Invalid service/action' });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

app.get('/api/db-check', async (req, res) => {
    try {
        const result = await db.collection('coach_settings').limit(1).get();
        res.json({ ok: true, count: result.data.length });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.listen(process.env.PORT || 80, () => console.log('Server running'));
