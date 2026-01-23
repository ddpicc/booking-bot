import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { callService, callCloudContainer } from '../../utils';
import './index.css';

const QrPage: React.FC = () => {
  const router = Taro.useRouter();
  const sceneCoachId = router.params.scene ? decodeURIComponent(router.params.scene) : '';
  const coachIdFromQuery = router.params.coachId || '';
  const coachId = useMemo(() => sceneCoachId || coachIdFromQuery, [sceneCoachId, coachIdFromQuery]);
  const coachName = decodeURIComponent(router.params.coachName || '') || '教练';

  const [qrSrc, setQrSrc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bound, setBound] = useState(false);

  useEffect(() => {
    if (!coachId) {
      setError('缺少教练 ID');
      return;
    }
    const gen = async () => {
      setLoading(true);
      try {
        const res = await callCloudContainer('/api/qrcode', { coachId }) as any;
        const payload = (res as any).data || {};
        if (payload?.ok) {
          setQrSrc(`data:image/png;base64,${payload.imageBase64}`);
        } else {
          setError(payload?.message || '生成二维码失败');
        }
      } catch (e: any) {
        setError(e?.message || '生成二维码失败');
      } finally {
        setLoading(false);
      }
    };
    gen();
  }, [coachId]);

  // 学员扫码自动绑定
  useEffect(() => {
    const bind = async () => {
      if (!coachId) return;
      try {
        const res = await callService('students', 'bindCoach', { coachId }) as any;
        if (res?.data?.ok) {
          setBound(true);
          Taro.showToast({ title: '已绑定教练', icon: 'success', duration: 1200 });
        }
      } catch (_) { /* ignore */ }
    };
    bind();
  }, [coachId]);

  return (
    <View className="qr-page">
      <View className="qr-card">
        <Text className="qr-title">专属二维码</Text>
        <Text className="qr-subtitle">学员扫码后自动绑定到你的账号</Text>
        <View className="qr-info">
          <Text className="qr-name">{coachName}</Text>
          <Text className="qr-id">ID: {coachId}</Text>
        </View>
        {bound && <View className="qr-bound">已自动绑定成功</View>}
        <View className="qr-box">
          {loading && <Text className="qr-loading">生成中...</Text>}
          {error && <Text className="qr-error">{error}</Text>}
          {!loading && !error && qrSrc && (
            <Image className="qr-image" src={qrSrc} mode="aspectFit" />
          )}
        </View>
        <View className="qr-actions">
          <Button className="qr-save" openType="share">分享二维码</Button>
          <Button className="qr-refresh" onClick={() => Taro.reLaunch({ url: `/pages/qrcode/index?coachId=${coachId}&coachName=${encodeURIComponent(coachName)}` })}>重新生成</Button>
        </View>
      </View>
    </View>
  );
};

export default QrPage;
