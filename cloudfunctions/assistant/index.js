const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const API_KEY = 'sk-M9dAAx2KVKwC0b73XT7XRpyMbMs37Z1jIAqyKPwkjDeeR3ez';
const API_URL = 'https://www.dmxapi.cn/v1/chat/completions';
const MODEL = 'GLM-4.5-Flash';

// 工具定义
const tools = [
    {
        type: 'function',
        function: {
            name: 'get_student_profile',
            description: '获取当前学员的个人资料、余额以及绑定的教练信息',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
];

// 格式化 Date 对象为北京时间 HH:mm
function formatLocalTime(date) {
    if (!date) return '';
    const d = new Date(date);
    // 强制使用 +8 时区计算
    const offset = 8;
    const localDate = new Date(d.getTime() + offset * 3600 * 1000);
    return localDate.toISOString().substr(11, 5);
}

// 解析 XML 格式的工具调用（应对部分模型幻觉）
function parseXmlToolCalls(content) {
    if (!content || !content.includes('<tool_call>')) return null;

    const toolCalls = [];
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;

    while ((match = toolCallRegex.exec(content)) !== null) {
        const innerContent = match[1];
        const nameMatch = innerContent.match(/^([^\n<]+)/);
        const name = nameMatch ? nameMatch[1].trim() : 'create_booking_request';

        const args = {};
        const argRegex = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)(?:<\/arg_value>|$)/g;
        let argMatch;
        while ((argMatch = argRegex.exec(innerContent)) !== null) {
            args[argMatch[1].trim()] = argMatch[2].trim();
        }

        toolCalls.push({
            id: `call_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
                name,
                arguments: JSON.stringify(args)
            }
        });
    }

    return toolCalls.length > 0 ? toolCalls : null;
}

// 实现工具函数
async function handleToolCall(toolCall, coachId, openId) {
    const { name, arguments: argsString } = toolCall.function;
    let args = JSON.parse(argsString);

    // 参数映射容错（处理模型幻觉输出的错误参数名）
    if (name === 'create_booking_request') {
        if (args.name && !args.studentName) args.studentName = args.name;
        if (args.phone_number && !args.phoneNumber) args.phoneNumber = args.phone_number;
        if (args.time && !args.startTime) args.startTime = args.time;
        if (!args.endTime && args.startTime) {
            // 默认一小时
            const [h, m] = args.startTime.split(':').map(Number);
            args.endTime = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
    }

    if (name === 'get_student_profile') {
        const studentRes = await db.collection('students').where({ openid: openId }).get();
        if (studentRes.data.length === 0) {
            return JSON.stringify({ ok: false, message: '未找到您的学员信息，请先在“学员管理”录入。' });
        }
        const student = studentRes.data[0];
        let coachName = '未知';
        if (student.coachId) {
            const coachRes = await db.collection('coaches').doc(student.coachId).get().catch(() => ({ data: null }));
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
        return JSON.stringify({ ok: false, message: '请先告诉我是哪位教练（提供姓名或 ID）。' });
    }

    if (name === 'get_available_slots') {
        const { date } = args;
        // 数据库查询也需要考虑时区，通常云数据库存储的是 UTC，
        // 这里构建当天的 00:00:00 到 23:59:59 (北京时间)
        const start = new Date(`${date}T00:00:00.000+08:00`);
        const end = new Date(`${date}T23:59:59.999+08:00`);

        const bookings = await db.collection('bookings')
            .where({
                coachId,
                status: _.neq('cancelled'),
                startTime: _.gte(start).and(_.lt(end)),
            })
            .get();

        const locks = await db.collection('locks')
            .where({
                coachId,
                startTime: _.gte(start).and(_.lt(end)),
            })
            .get();

        return JSON.stringify({
            date,
            existing_bookings: bookings.data.map(b => ({
                local_time: `${formatLocalTime(b.startTime)} - ${formatLocalTime(b.endTime)}`,
                service: b.serviceName
            })),
            locks: locks.data.map(l => ({
                local_time: `${formatLocalTime(l.startTime)} - ${formatLocalTime(l.endTime)}`,
                reason: l.reason
            })),
            business_hours: '09:00 - 22:00'
        });
    }

    if (name === 'create_booking_request') {
        const { date, startTime, endTime, serviceName, studentName, phoneNumber } = args;
        const startIso = `${date}T${startTime}:00.000+08:00`;
        const endIso = `${date}T${endTime}:00.000+08:00`;

        // 检查学员课时余额
        const studentRes = await db.collection('students').where({ openid: openId }).get();
        if (studentRes.data.length > 0) {
            const student = studentRes.data[0];
            if (student.remainingHours <= 0) {
                return JSON.stringify({ ok: false, message: `您的课时余额不足（当前：${student.remainingHours}），请联系教练充值。` });
            }
        }

        // 调用 booking 云函数以使用其校验逻辑
        const res = await cloud.callFunction({
            name: 'booking',
            data: {
                action: 'create',
                coachId: coachId,
                studentId: openId,
                studentName: studentName,
                phoneNumber: phoneNumber,
                serviceId: 'ai-gen',
                serviceName: serviceName,
                startTime: startIso,
                endTime: endIso,
                status: 'pending' // AI 创建的一律设为待确认
            }
        });

        const result = res.result;
        if (result.ok) {
            return JSON.stringify({ ok: true, bookingId: result.id });
        } else {
            return JSON.stringify({ ok: false, message: result.message || '创建预约失败' });
        }
    }

    return 'Unknown tool';
}

exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext();
    const { messages, currentDate, coachName: mentionedCoachName } = event;

    // 使用传入的日期或服务器当前日期
    const now = currentDate ? new Date(currentDate) : new Date();
    const dateString = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const timeString = now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const dayOfWeek = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];

    // --- 多教练定位逻辑 ---
    let effectiveCoachId = event.coachId;
    let studentInfo = null;

    // 1. 获取学员信息
    const studentRes = await db.collection('students').where({ openid: OPENID }).get();
    if (studentRes.data.length > 0) {
        studentInfo = studentRes.data[0];
        if (!effectiveCoachId || effectiveCoachId === 'coach') {
            effectiveCoachId = studentInfo.coachId;
        }
    }

    // 2. 如果用户提到了教练姓名，尝试匹配
    if (mentionedCoachName) {
        const coachMatch = await db.collection('coaches').where({
            name: db.RegExp({ regexp: mentionedCoachName, options: 'i' })
        }).get();
        if (coachMatch.data.length === 1) {
            effectiveCoachId = coachMatch.data[0]._id;
        } else if (coachMatch.data.length > 1) {
            // 姓名重复，保持现状或让 AI 询问
        }
    }

    const coachContext = effectiveCoachId && effectiveCoachId !== 'coach'
        ? `你正在为教练（ID: ${effectiveCoachId}）提供服务。`
        : '你目前还不清楚是在为哪位教练提供服务。';

    const studentContext = studentInfo
        ? `学员姓名：${studentInfo.name}，剩余课时：${studentInfo.remainingHours}。`
        : '当前尚未识别到该学员的录入信息。';

    try {
        let currentMessages = [
            {
                role: 'system',
                content: `你是一个专业的体育预约助手。${coachContext} ${studentContext}
【核心规则】 (非常重要，请严格遵守)
1. 当前北京时间是：${dateString} ${timeString} (${dayOfWeek})。
2. 严禁在回复中输出任何形式的 XML 标签（如 <tool_call>、<arg_key> 等）。
3. 必须通过标准的 tool_calls 机制来调用工具。不要在文本中模拟工具调用过程。
4. **[重要] 教练定位逻辑**：
    - 如果 coachId 为空或不明确，请通过 \`get_student_profile\` 确认。
    - 如果无法通过姓名匹配教练，请礼貌地让用户提供教练的数字 ID (coachId)。
5. **[重要] 课时校验**：预约前先检查课时余额。如果余额为 0 或不足，告知学员。
6. 预约前必须确认“姓名”和“电话号码”。
7. 查询结果中的 local_time 即为展示给用户的北京时间。
请以亲切、高效的语气回复。`
            },
            ...messages
        ];

        // 第一次调用 LLM
        let response = await axios.post(API_URL, {
            model: MODEL,
            messages: currentMessages,
            tools: tools,
            tool_choice: 'auto'
        }, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let message = response.data.choices[0].message;

        // 容错处理：检测内容中是否存在 XML 形式的工具调用
        const xmlToolCalls = parseXmlToolCalls(message.content);
        if (xmlToolCalls && !message.tool_calls) {
            message.tool_calls = xmlToolCalls;
            // 清理内容中的标签，避免展示给用户
            message.content = message.content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim() || '正在为您处理...';
        }

        // 处理工具调用
        if (message.tool_calls) {
            currentMessages.push(message);

            for (const toolCall of message.tool_calls) {
                const result = await handleToolCall(toolCall, effectiveCoachId, OPENID);
                currentMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: result
                });
            }

            // 第二次调用 LLM 获取最终回答
            response = await axios.post(API_URL, {
                model: MODEL,
                messages: currentMessages
            }, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            message = response.data.choices[0].message;
        }

        return {
            ok: true,
            reply: message.content,
            messages: [...messages, message]
        };

    } catch (error) {
        console.error('AI Assistant Error:', error);
        return {
            ok: false,
            message: error.message || 'AI 助手暂时无法响应'
        };
    }
};
