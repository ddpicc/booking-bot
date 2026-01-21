const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cloudbase = require("@cloudbase/node-sdk");
const axios = require('axios');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 初始化云开发 SDK (数据模型模式)
// 注意：以下密钥为临时测试硬编码，测试完成后建议删除
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

// 中间件：日志打印，方便排查
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers));
    next();
});

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
    // 云托管中从 Header 获取 OPENID，测试环境下增加兜底
    const OPENID = req.headers['x-wx-openid'] || 'TEST_WEB_USER';

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

// 3. 诊断接口
app.get('/api/db-check', async (req, res) => {
    console.time('db-check');
    try {
        const result = await db.collection('coaches').limit(1).get();
        console.timeEnd('db-check');
        res.json({ ok: true, message: 'Database connected', count: result.data.length });
    } catch (e) {
        console.timeEnd('db-check');
        console.error('[DB Check Failed]', e);
        res.status(500).json({ ok: false, message: e.message, stack: e.stack });
    }
});

app.post('/api/call', async (req, res) => {
    const { service, action, data } = req.body;
    // 云托管中从 Header 获取 OPENID，测试环境下增加兜底
    const OPENID = req.headers['x-wx-openid'] || 'TEST_WEB_USER';

    console.time(`db-${service}-${action}`);
    try {
        if (service === 'students') {
            if (action === 'list') {
                const result = await db.collection('students').where({ coachId: data.coachId || 'COACH_88888' }).get();
                console.timeEnd(`db-${service}-${action}`);
                return res.json({ ok: true, data: result.data });
            }
        }
        if (service === 'booking') {
            if (action === 'deduct') {
                await db.collection('students').doc(data.studentId).update({ data: { remainingHours: _.inc(-data.hours) } });
                console.timeEnd(`db-${service}-${action}`);
                return res.json({ ok: true });
            }
            if (action === 'getCoach') {
                const result = await db.collection('coaches').doc(data.coachId).get();
                console.timeEnd(`db-${service}-${action}`);
                return res.json({ ok: true, data: result.data });
            }
        }
        console.timeEnd(`db-${service}-${action}`);
        res.status(400).json({ ok: false, message: 'Invalid service/action' });
    } catch (e) {
        console.timeEnd(`db-${service}-${action}`);
        console.error('[DB Operation Error]', e);
        res.status(500).json({ ok: false, message: e.message, stack: e.stack });
    }
});

app.get('/', (req, res) => res.send('Booking Bot Cloud Hosting is running!'));

const port = process.env.PORT || 80;
app.listen(port, () => console.log(`Listening on port ${port}`));
