const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cloud = require('wx-server-sdk');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 初始化云开发 SDK
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// --- 配置集 ---
const API_KEY = 'sk-M9dAAx2KVKwC0b73XT7XRpyMbMs37Z1jIAqyKPwkjDeeR3ez';
const API_URL = 'https://www.dmxapi.cn/v1/chat/completions';
const MODEL = 'GLM-4.5-Flash';

// --- 工具函数 ---
const assertRequired = (data, keys) => {
    const missing = keys.filter((key) => data[key] === undefined || data[key] === null || data[key] === '');
    if (missing.length) throw new Error(`Missing fields: ${missing.join(', ')}`);
};

const toDate = (value) => {
    if (!value) return null;
    return value instanceof Date ? value : new Date(value);
};

function formatLocalTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const offset = 8;
    const localDate = new Date(d.getTime() + offset * 3600 * 1000);
    return localDate.toISOString().substr(11, 5);
}

// --- AI 助手核心逻辑 ---
async function handleToolCall(toolCall, coachId, openId) {
    const { name, arguments: argsString } = toolCall.function;
    let args = JSON.parse(argsString);

    if (name === 'get_student_profile') {
        const studentRes = await db.collection('students').where({ openid: openId }).get();
        if (studentRes.data.length === 0) return JSON.stringify({ ok: false, message: '未找到学员信息' });
        const student = studentRes.data[0];
        return JSON.stringify({ ok: true, studentName: student.name, remainingHours: student.remainingHours });
    }

    if (name === 'get_available_slots') {
        const { date } = args;
        const start = new Date(`${date}T00:00:00.000+08:00`);
        const end = new Date(`${date}T23:59:59.999+08:00`);
        const bookings = await db.collection('bookings').where({
            coachId, status: _.neq('cancelled'), startTime: _.gte(start).and(_.lt(end))
        }).get();
        return JSON.stringify({ date, bookings: bookings.data.map(b => `${formatLocalTime(b.startTime)}-${formatLocalTime(b.endTime)}`) });
    }

    if (name === 'create_booking_request') {
        const { date, startTime, endTime, studentName } = args;
        const res = await db.collection('bookings').add({
            data: {
                coachId, studentId: openId, studentName, serviceName: args.serviceName || 'AI 预约',
                startTime: new Date(`${date}T${startTime}:00.000+08:00`),
                endTime: new Date(`${date}T${endTime}:00.000+08:00`),
                status: 'pending', createdAt: new Date()
            }
        });
        return JSON.stringify({ ok: true, bookingId: res._id });
    }
    return 'Unknown tool';
}

// --- API 路由 ---

// 1. AI 助手
app.post('/api/assistant', async (req, res) => {
    const { messages, currentDate, coachId } = req.body;
    // 云托管中从 Header 获取 OPENID
    const OPENID = req.headers['x-wx-openid'];

    try {
        const response = await axios.post(API_URL, {
            model: MODEL,
            messages: [{ role: 'system', content: `当前时间: ${currentDate || new Date().toISOString()}` }, ...messages],
            tools: [{ type: 'function', function: { name: 'get_available_slots', parameters: { type: 'object', properties: { date: { type: 'string' } } } } }],
            tool_choice: 'auto'
        }, { headers: { 'Authorization': `Bearer ${API_KEY}` } });

        let message = response.data.choices[0].message;
        if (message.tool_calls) {
            for (const toolCall of message.tool_calls) {
                const result = await handleToolCall(toolCall, coachId || 'COACH_88888', OPENID);
                // 这里简略处理，实际应递归调用 LLM
                message.content = `[工具调用结果: ${result}]`;
            }
        }
        res.json({ ok: true, reply: message.content });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// 2. 统一业务接口 (替代 booking 和 students 云函数)
app.post('/api/call', async (req, res) => {
    const { service, action, data } = req.body;
    // 云托管中从 Header 获取 OPENID
    const OPENID = req.headers['x-wx-openid'];

    try {
        if (service === 'students') {
            if (action === 'list') {
                const result = await db.collection('students').where({ coachId: data.coachId || 'COACH_88888' }).get();
                return res.json({ ok: true, data: result.data });
            }
        }
        if (service === 'booking') {
            if (action === 'deduct') {
                await db.collection('students').doc(data.studentId).update({ data: { remainingHours: _.inc(-data.hours) } });
                return res.json({ ok: true });
            }
            if (action === 'getCoach') {
                const result = await db.collection('coaches').doc(data.coachId).get();
                return res.json({ ok: true, data: result.data });
            }
        }
        res.status(400).json({ ok: false, message: 'Invalid service/action' });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

app.get('/', (req, res) => res.send('Booking Bot Cloud Hosting is running!'));

const port = process.env.PORT || 80;
app.listen(port, () => console.log(`Listening on port ${port}`));
