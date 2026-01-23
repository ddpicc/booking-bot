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
// 修正：使用默认数据库实例，与小程序端保持一致
const db = cloud.database();
const _ = db.command;
const USERS_COLLECTION = 'users';     // 小程序用户（教练）表
const CLIENTS_COLLECTION = 'client';  // 教练名下的学员表

// 生成短 coachId，避免 openid 过长且保持唯一
const generateCoachId = async () => {
    for (let i = 0; i < 5; i++) {
        const candidate = `c${Math.random().toString(36).slice(2, 8)}`;
        const exists = await db.collection(USERS_COLLECTION).where({ coachId: candidate }).limit(1).get();
        if (exists.data.length === 0) return candidate;
    }
    return `c${Date.now().toString(36)}`;
};

// 中间件：日志打印
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// --- 配置集 ---
const API_KEY = 'sk-M9dAAx2KVKwC0b73XT7XRpyMbMs37Z1jIAqyKPwkjDeeR3ez';
const API_URL = 'https://www.dmxapi.cn/v1/chat/completions';
const MODEL = 'gpt-5-nano';

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

const getDateKey = (value) => {
    if (!value) return null;
    const d = toDate(value);
    return d ? d.toISOString().slice(0, 10) : null;
};

// 容错：解析 XML 形式的工具调用
const parseXmlToolCalls = (content) => {
    if (!content || !content.includes('<tool_call>')) return null;
    const toolCalls = [];
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;
    while ((match = toolCallRegex.exec(content)) !== null) {
        const inner = match[1];
        const nameMatch = inner.match(/^([^\n<]+)/);
        const name = nameMatch ? nameMatch[1].trim() : 'get_available_slots';
        const args = {};
        const argRegex = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)(?:<\/arg_value>|$)/g;
        let argMatch;
        while ((argMatch = argRegex.exec(inner)) !== null) {
            args[argMatch[1].trim()] = argMatch[2].trim();
        }
        toolCalls.push({
            id: `call_${Math.random().toString(36).slice(2, 9)}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) }
        });
    }
    return toolCalls.length ? toolCalls : null;
};

// --- AI 助手核心逻辑 ---
async function handleToolCall(toolCall, coachId, openId) {
    const { name, arguments: argsString } = toolCall.function;
    let args = JSON.parse(argsString);

    if (name === 'get_student_profile') {
        const studentRes = await db.collection(CLIENTS_COLLECTION).where({ openid: openId }).get();
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
        console.log(`[AI Tool] get_available_slots: coachId=${coachId}, date=${date}`);
        const rangeCondition = { coachId, status: _.neq('cancelled'), startTime: _.gte(start).and(_.lt(end)) };
        const dateCondition = { coachId, date };
        const bookings = await db.collection('bookings').where(_.or([rangeCondition, dateCondition])).get();
        const lockRange = { coachId, startTime: _.gte(start).and(_.lt(end)) };
        const lockDate = { coachId, date };
        const locks = await db.collection('locks').where(_.or([lockRange, lockDate])).get();

        console.log(`[AI Tool] Query Results: bookings=${bookings.data.length}, locks=${locks.data.length}`);

        return JSON.stringify({
            date,
            existing_bookings: bookings.data.map(b => `${formatLocalTime(b.startTime)}-${formatLocalTime(b.endTime)} (${b.serviceName})`),
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
            coachId, studentId: openId, studentName, serviceName: serviceName || 'AI 预约',
            startTime: start, endTime: end, status: 'pending', createdAt: new Date()
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
        const studentRes = await db.collection(CLIENTS_COLLECTION).where({ openid: OPENID }).get();
        if (studentRes.data.length > 0) {
            studentInfo = studentRes.data[0];
            const isPlaceholder = !effectiveCoachId || effectiveCoachId === 'coach' || effectiveCoachId === 'COACH_88888';
            if (isPlaceholder) effectiveCoachId = studentInfo.coachId;
        }

        // 3. Fallback to default
        if (!effectiveCoachId || effectiveCoachId === 'coach' || effectiveCoachId === 'COACH_88888') {
            effectiveCoachId = 'test_coach_001';
        }

        // 2. 姓名模糊匹配
        if (mentionedCoachName) {
            const coachMatch = await db.collection('coach_settings').where({
                name: { $regex: mentionedCoachName, $options: 'i' }
            }).get();
            if (coachMatch.data.length === 1) effectiveCoachId = coachMatch.data[0]._id;
        }

        const now = currentDate ? new Date(currentDate) : new Date();
        // 获得北京时间的 YYYY-MM-DD
        const bjNow = new Date(now.getTime() + 8 * 3600000);
        const dateString = bjNow.toISOString().split('T')[0];
        const timeString = bjNow.toISOString().split('T')[1].substr(0, 5);
        const dayOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];

        const coachContext = effectiveCoachId && effectiveCoachId !== 'coach'
            ? `你正在为教练（ID: ${effectiveCoachId}）提供服务。`
            : '你目前还不清楚是在为哪位教练提供服务。';

        const studentContext = studentInfo
            ? `学员姓名：${studentInfo.name}，剩余课时：${studentInfo.remainingHours}。`
            : '当前尚未识别到该学员的录入信息。';

        let currentMessages = [
            {
                role: 'system',
                content: `你是一个专业的体育预约助手。${coachContext} ${studentContext}
【当前时间】
今天是：${dateString} ${timeString} (${dayOfWeek})。请务必根据此时间上下文理解用户的“今天”、“明天”或“几点”等相对时间概念。

【核心规则】
1. **[重要] 日期优先**：如果用户询问“什么时候有空”或“今天/明天能不能约”，请优先使用 get_available_slots 查询。如果用户未指定日期，默认查询 ${dateString} (今天)。
2. **[重要] 预约检查**：在执行 create_booking_request 之前，必须先调用 get_available_slots 确认用户选择的时间段是空闲的。
3. **[重要] 状态反馈**：查询结果会显示 existing_bookings (已有预约) 和 locks (锁定不可约)。如果查询结果为空，说明该日期目前完全空闲。
4. **定位教练**：若不明确哪位教练，优先通过 get_student_profile 确认；否则礼貌询问用户。
5. **课时校验**：余额不足（remainingHours <= 0）时，婉拒预约并提醒充值。
6. **合规提示**：严禁输出任何 XML 标签。必须使用标准 tool_calls 机制。`
            },
            ...messages
        ];

        let response = await axios.post(API_URL, {
            model: MODEL,
            messages: currentMessages,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'get_student_profile',
                        description: '获取当前学员的个人资料、课时余额以及绑定的教练信息'
                    }
                },
                {
                    type: 'function',
                    function: {
                        name: 'get_available_slots',
                        description: '查询指定日期的教练排班、已有预约和时间锁定情况',
                        parameters: {
                            type: 'object',
                            properties: {
                                date: {
                                    type: 'string',
                                    description: '查询日期，格式为 YYYY-MM-DD (例如: 2026-01-21)'
                                }
                            },
                            required: ['date']
                        }
                    }
                },
                {
                    type: 'function',
                    function: {
                        name: 'create_booking_request',
                        description: '发起一个新的预约请求。发起前务必先查询可用状态。',
                        parameters: {
                            type: 'object',
                            properties: {
                                date: { type: 'string', description: '预约日期 (YYYY-MM-DD)' },
                                startTime: { type: 'string', description: '开始时间 (HH:mm)' },
                                endTime: { type: 'string', description: '结束时间 (HH:mm)' },
                                studentName: { type: 'string', description: '学员姓名' },
                                serviceName: { type: 'string', description: '课程或服务名称 (例如: 网球私教课)' }
                            },
                            required: ['date', 'startTime', 'endTime', 'studentName']
                        }
                    }
                }
            ],
            tool_choice: 'auto'
        }, { headers: { 'Authorization': `Bearer ${API_KEY}` } });

        let message = response.data.choices[0].message;
        // 容错：如果模型用文本描述了工具调用
        const xmlCalls = parseXmlToolCalls(message.content);
        if (xmlCalls && !message.tool_calls) {
            message.tool_calls = xmlCalls;
            message.content = message.content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim() || '正在处理...';
        }

        if (message.tool_calls) {
            currentMessages.push(message);
            for (const toolCall of message.tool_calls) {
                const rawResult = await handleToolCall(toolCall, effectiveCoachId || 'test_coach_001', OPENID);
                currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: rawResult
                });
            }
            // 二次 LLM 生成最终回答
            response = await axios.post(API_URL, {
                model: MODEL,
                messages: currentMessages
            }, { headers: { 'Authorization': `Bearer ${API_KEY}` } });
            message = response.data.choices[0].message;
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
        if (service === 'auth') {
            if (action === 'bootstrap') {
                const result = await db.collection(USERS_COLLECTION).where({ openid: OPENID }).limit(1).get();
                if (result.data.length === 0) {
                    return res.json({ ok: true, data: null });
                }
                const user = result.data[0];
                return res.json({ ok: true, data: { ...user, id: user._id || user.id } });
            }
            if (action === 'bindProfile') {
                const incomingCoachId = data && data.coachId;
                const existing = await db.collection(USERS_COLLECTION).where({ openid: OPENID }).limit(1).get();
                const existingCoachId = existing.data?.[0]?.coachId;
                const resolvedCoachId = existingCoachId || incomingCoachId || await generateCoachId();
                const payload = {
                    openid: OPENID,
                    name: (data && data.name) || '教练',
                    avatar: (data && data.avatar) || '',
                    coachId: resolvedCoachId,
                    role: 'coach',
                    updatedAt: new Date()
                };
                if (existing.data.length > 0) {
                    const targetId = existing.data[0]._id;
                    await db.collection(USERS_COLLECTION).doc(targetId).update({ data: payload });
                    return res.json({ ok: true, data: { ...existing.data[0], ...payload, id: targetId } });
                }
                const createRes = await db.collection(USERS_COLLECTION).add({ ...payload, createdAt: new Date() });
                return res.json({ ok: true, data: { ...payload, id: createRes._id } });
            }
        }
        if (service === 'students') {
            if (action === 'list') {
                const result = await db.collection(CLIENTS_COLLECTION).where({ coachId: data.coachId || 'test_coach_001' }).get();
                return res.json({ ok: true, data: result.data });
            }
            if (action === 'create') {
                const result = await db.collection(CLIENTS_COLLECTION).add({ ...data, createdAt: new Date() });
                return res.json({ ok: true, id: result._id });
            }
            if (action === 'getProfile') {
                const result = await db.collection(CLIENTS_COLLECTION).where({ openid: OPENID }).get();
                return res.json({ ok: true, data: result.data[0] || null });
            }
        }
        if (service === 'lock') {
            const effectiveCoachId = data.coachId || 'test_coach_001';
            if (action === 'listByDate') {
                const { start, end } = getDayRange(data.date);
                console.log(`[Lock] Querying: coachId=${effectiveCoachId}, date=${data.date}`);
                console.log(`[Lock] Range UTC: ${start.toISOString()} - ${end.toISOString()}`);

                // 同时兼容按日期字段和按时间范围的历史数据
                const rangeCondition = { coachId: effectiveCoachId, startTime: _.gte(start).and(_.lt(end)) };
                const dateCondition = { coachId: effectiveCoachId, date: data.date };
                const result = await db.collection('locks').where(_.or([rangeCondition, dateCondition])).get();

                console.log(`[Lock] Query result count: ${result.data.length}`);
                if (result.data.length === 0) {
                    // 如果没找到，打印一下这个日期前后的数据作为参考
                    const nearby = await db.collection('locks').where({ coachId: effectiveCoachId }).limit(3).get();
                    console.log(`[Lock] Nearby samples for coach:`, nearby.data.map(d => ({ id: d._id, start: d.startTime, type: typeof d.startTime })));
                }
                return res.json({ ok: true, data: result.data });
            }
            if (action === 'debug') {
                const result = await db.collection('locks').limit(10).get();
                const debugData = result.data.map(d => ({
                    _id: d._id,
                    coachId: d.coachId,
                    coachIdType: typeof d.coachId,
                    startTime: d.startTime,
                    startTimeType: typeof d.startTime,
                    isDateObject: d.startTime instanceof Date
                }));
                return res.json({ ok: true, debug: debugData });
            }
            if (action === 'create') {
                const start = toDate(data.startTime);
                const end = toDate(data.endTime);
                const result = await db.collection('locks').add({
                    ...data,
                    coachId: effectiveCoachId,
                    date: data.date || getDateKey(start),
                    startTime: start,
                    endTime: end,
                    createdAt: new Date()
                });
                return res.json({ ok: true, id: result._id });
            }
        }
        if (service === 'booking') {
            const effectiveCoachId = data.coachId || 'test_coach_001';
            if (action === 'create') {
                const start = toDate(data.startTime);
                const end = toDate(data.endTime);

                // 统一校验重叠 (手动创建也检查)
                const overlapBookings = await db.collection('bookings').where({
                    coachId: effectiveCoachId, status: _.neq('cancelled'), startTime: _.lt(end), endTime: _.gt(start)
                }).get();
                const overlapLocks = await db.collection('locks').where({
                    coachId: effectiveCoachId, startTime: _.lt(end), endTime: _.gt(start)
                }).get();

                if (overlapBookings.data.length || overlapLocks.data.length) {
                    return res.json({ ok: false, message: '该时间段已被占用或锁定' });
                }

                const result = await db.collection('bookings').add({
                    ...data,
                    coachId: effectiveCoachId,
                    date: data.date || getDateKey(start),
                    studentId: data.studentId || OPENID,
                    startTime: start,
                    endTime: end,
                    createdAt: new Date()
                });
                return res.json({ ok: true, id: result._id });
            }
            if (action === 'listByDate') {
                const { start, end } = getDayRange(data.date);
                console.log(`[Booking] Querying: coachId=${effectiveCoachId}, date=${data.date}`);
                const rangeCondition = { coachId: effectiveCoachId, startTime: _.gte(start).and(_.lt(end)) };
                const dateCondition = { coachId: effectiveCoachId, date: data.date };
                const result = await db.collection('bookings').where(_.or([rangeCondition, dateCondition])).get();
                return res.json({ ok: true, data: result.data });
            }
            if (action === 'updateStatus') {
                await db.collection('bookings').doc(data.bookingId).update({ data: { status: data.status, updatedAt: new Date() } });
                return res.json({ ok: true });
            }
            if (action === 'deduct') {
                await db.collection(CLIENTS_COLLECTION).doc(data.studentId).update({ data: { remainingHours: _.inc(-data.hours) } });
                return res.json({ ok: true });
            }
            if (action === 'getCoach') {
                const result = await db.collection('coach_settings').doc(data.coachId).get();
                return res.json({ ok: true, data: result.data });
            }
            if (action === 'updateCoach') {
                const coachId = data.coachId || 'test_coach_001';
                const payload = {
                    settings: data.settings || {},
                    updatedAt: new Date()
                };
                try {
                    // 尝试更新
                    await db.collection('coach_settings').doc(coachId).update({ data: payload });
                } catch (err) {
                    // 如果不存在则创建
                    await db.collection('coach_settings').add({ _id: coachId, ...payload, createdAt: new Date() });
                }
                return res.json({ ok: true });
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
