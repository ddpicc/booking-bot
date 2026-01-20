import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.css';

const ChatPage: React.FC = () => {
    const router = Taro.useRouter();
    const coachId = router.params.coachId || 'coach';

    const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant' | 'system', content: string }>>([
        { role: 'assistant', content: '你好！我是你的预约助手。你可以问我教练的日程，或者直接告诉我你想预约的时间。' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<any>(null);

    const handleSend = async () => {
        if (!inputValue.trim() || loading) return;

        const userMessage = { role: 'user' as const, content: inputValue };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInputValue('');
        setLoading(true);

        try {
            const res = await Taro.cloud.callFunction({
                name: 'assistant',
                data: {
                    messages: newMessages.filter(m => m.role !== 'system'),
                    currentDate: new Date().toISOString(),
                    coachId: coachId
                }
            });

            const result: any = res.result;
            if (result.ok) {
                setMessages([...newMessages, { role: 'assistant', content: result.reply }]);
            } else {
                Taro.showToast({ title: result.message || '请求失败', icon: 'none' });
            }
        } catch (error) {
            console.error('Chat Error:', error);
            Taro.showToast({ title: '网络繁忙，请稍后再试', icon: 'none' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <View className="chat-page">
            <ScrollView
                className="chat-messages"
                scrollY
                scrollWithAnimation
                ref={scrollRef}
            >
                {messages.map((msg, index) => (
                    <View key={index} className={`chat-bubble-wrapper ${msg.role}`}>
                        <View className={`chat-bubble ${msg.role}`}>
                            <Text className="chat-content">{msg.content}</Text>
                        </View>
                    </View>
                ))}
                {loading && (
                    <View className="chat-bubble-wrapper assistant">
                        <View className="chat-bubble assistant loading">
                            <View className="dot" />
                            <View className="dot" />
                            <View className="dot" />
                        </View>
                    </View>
                )}
                <View className="chat-bottom-spacer" />
            </ScrollView>

            <View className="chat-input-area">
                <Input
                    className="chat-input"
                    value={inputValue}
                    onInput={(e) => setInputValue(e.detail.value)}
                    confirmType="send"
                    onConfirm={handleSend}
                    placeholder="输入您的问题..."
                />
                <Button className="chat-send-btn" onClick={handleSend} disabled={loading}>
                    <Text className="material-symbols-outlined">send</Text>
                </Button>
            </View>
        </View>
    );
};

export default ChatPage;
