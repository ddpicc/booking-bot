import React, { useState } from 'react';
import { View, Text, ScrollView, Button, Switch, Slider, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useStore } from '../../store';
import { callService } from '../../utils';
import './index.css';

const SettingsPage: React.FC = () => {
  const { coachSettings, setCoachSettings, services, setServices, addService, updateService, deleteService } = useStore();
  const coachId = 'test_coach_001'; // 统一测试 ID

  const [bufferTime, setBufferTime] = useState<number>(coachSettings.bufferTime || 15);
  const [minAdvance, setMinAdvance] = useState<number>(coachSettings.minAdvanceHours || 4);
  const [maxFuture, setMaxFuture] = useState<number>(coachSettings.maxFutureDays || 14);
  const [autoAccept, setAutoAccept] = useState<boolean>(coachSettings.autoAccept ?? false);
  const [allowCancel, setAllowCancel] = useState<boolean>(coachSettings.allowCancelWithin24h ?? false);
  const [dailyLimit, setDailyLimit] = useState<boolean>(coachSettings.dailyLimitEnabled ?? true);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    fetchCoachData();
  }, []);

  const fetchCoachData = async () => {
    setLoading(true);
    try {
      const res = await callService('booking', 'getCoach', { coachId }) as any;
      console.log('[Settings] Fetch Coach Response:', res);
      if (res?.data && res.data.ok) {
        // 兼容不同返回结构，安全合并默认值，避免 undefined
        const payload = res.data.data || res.data;
        const cloudSettings = payload.settings || payload || {};
        const mergedSettings = {
          ...coachSettings,
          ...cloudSettings,
          services: cloudSettings.services || coachSettings.services || [],
        };

        setCoachSettings(mergedSettings);
        setServices(mergedSettings.services || []);
        // Update local states
        setBufferTime(mergedSettings.bufferTime ?? bufferTime);
        setAutoAccept(mergedSettings.autoAccept ?? autoAccept);
        setAllowCancel(mergedSettings.allowCancelWithin24h ?? allowCancel);
        setDailyLimit(mergedSettings.dailyLimitEnabled ?? dailyLimit);
        setMinAdvance(mergedSettings.minAdvanceHours ?? minAdvance);
        setMaxFuture(mergedSettings.maxFutureDays ?? maxFuture);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 课程管理相关状态
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceDuration, setServiceDuration] = useState(60);
  const [serviceHasGap, setServiceHasGap] = useState(false);
  const [serviceGapMinutes, setServiceGapMinutes] = useState(0);

  const handleSave = async () => {
    const newSettings = {
      ...coachSettings,
      bufferTime,
      minAdvanceHours: minAdvance,
      maxFutureDays: maxFuture,
      autoAccept,
      allowCancelWithin24h: allowCancel,
      dailyLimitEnabled: dailyLimit,
      services,
    };

    Taro.showLoading({ title: '保存中...' });
    try {
      const res = await callService('booking', 'updateCoach', {
        coachId,
        settings: newSettings
      }) as any;
      console.log('[Settings] Update Coach Response:', res);
      if (res?.data && res.data.ok) {
        setCoachSettings(newSettings);
        Taro.showToast({ title: '已同步到云端', icon: 'success' });
      }
    } catch (e) {
      Taro.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      Taro.hideLoading();
    }
  };

  const handleOpenServiceModal = (service: any = null) => {
    if (service) {
      setEditingService(service);
      setServiceName(service.name);
      setServiceDuration(service.duration);
      setServiceHasGap(service.hasGap || false);
      setServiceGapMinutes(service.gapMinutes || bufferTime || 0);
    } else {
      setEditingService(null);
      setServiceName('');
      setServiceDuration(60);
      setServiceHasGap(false);
      setServiceGapMinutes(bufferTime || 0);
    }
    setShowServiceModal(true);
  };

  const handleSaveService = () => {
    if (!serviceName.trim()) {
      Taro.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }

    const payload = {
      name: serviceName,
      duration: serviceDuration,
      hasGap: serviceHasGap,
      gapMinutes: serviceHasGap ? serviceGapMinutes : 0,
    };

    if (editingService) {
      updateService(editingService.id, payload);
      Taro.showToast({ title: '已更新课程', icon: 'success' });
    } else {
      addService({
        id: `s-${Date.now()}`,
        ...payload,
      });
      Taro.showToast({ title: '已添加课程', icon: 'success' });
    }
    // 同步全局课间休息默认值
    setBufferTime(serviceHasGap ? serviceGapMinutes : bufferTime);
    setShowServiceModal(false);
  };

  const handleDeleteService = (id: string) => {
    Taro.showModal({
      title: '删除确认',
      content: '确定要删除这个课程吗？',
      success: (res) => {
        if (res.confirm) {
          deleteService(id);
          Taro.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  };

  return (
    <View className="settings-page">
      {loading && <View className="loading-overlay"><Text>加载中...</Text></View>}
      <ScrollView className="settings-content">
        <View className="settings-coach-card">
          <View className="settings-coach-avatar-wrapper">
            <View className="settings-coach-avatar" />
            <View className="settings-coach-status-dot" />
          </View>
          <View className="settings-coach-info">
            <Text className="settings-coach-name">张伟教练</Text>
            <View className="settings-coach-badge">
              <Text className="settings-coach-id">ID: test_coach_001</Text>
            </View>
          </View>
        </View>

        <View className="settings-section-card no-padding">
          <View className="settings-section-header-row padding-h">
            <Text className="settings-section-heading">课程配置</Text>
            <View className="settings-add-btn" onClick={() => handleOpenServiceModal()}>
              <Text className="material-symbols-outlined">add</Text>
              <Text>添加课程</Text>
            </View>
          </View>

          <View className="settings-service-list">
            {services.map((service) => (
              <View key={service.id} className="settings-service-item" onClick={() => handleOpenServiceModal(service)}>
                <View className="settings-service-info">
                  <Text className="settings-service-name">{service.name}</Text>
                  <View className="settings-service-tags">
                    <Text className="settings-service-tag">{service.duration} 分钟</Text>
                    {service.hasGap && <Text className="settings-service-tag gap">课间 {service.gapMinutes || 0} 分钟</Text>}
                  </View>
                </View>
                <View className="settings-service-actions">
                  <Text
                    className="material-symbols-outlined settings-delete-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteService(service.id);
                    }}
                  >
                    delete
                  </Text>
                  <Text className="material-symbols-outlined settings-edit-icon">edit</Text>
                </View>
              </View>
            ))}
            {services.length === 0 && (
              <View className="settings-empty-state">
                <Text>暂无课程配置，请点击上方添加</Text>
              </View>
            )}
          </View>
        </View>

        <View className="settings-section-card no-padding">
          <Text className="settings-section-heading padding-h">AI 助手测试</Text>
          <View className="settings-list">
            <View className="settings-list-item no-border" onClick={() => Taro.navigateTo({ url: '/pages/chat/index?coachId=test_coach_001' })}>
              <View className="settings-item-left">
                <View className="settings-item-icon-box blue-lite">
                  <Text className="material-symbols-outlined">smart_toy</Text>
                </View>
                <View className="settings-list-text">
                  <Text className="settings-list-title">打开 AI 预约助手</Text>
                  <Text className="settings-list-subtitle">体验自然语言预约功能</Text>
                </View>
              </View>
              <Text className="material-symbols-outlined settings-select-icon">chevron_right</Text>
            </View>
          </View>
        </View>

        <View className="settings-section-card no-padding">
          <Text className="settings-section-heading padding-h">预约窗口</Text>
          <View className="settings-list">
            <View className="settings-list-item">
              <View className="settings-item-left">
                <View className="settings-item-icon-box blue-lite">
                  <Text className="material-symbols-outlined">bolt</Text>
                </View>
                <View className="settings-list-text">
                  <Text className="settings-list-title">最少提前预约</Text>
                  <Text className="settings-list-subtitle">避免最后一分钟的预约</Text>
                </View>
              </View>
              <View className="settings-list-value select">
                <Text className="settings-list-value-text">{minAdvance} 小时</Text>
                <Text className="material-symbols-outlined settings-select-icon">unfold_more</Text>
              </View>
            </View>
            <View className="settings-list-item">
              <View className="settings-item-left">
                <View className="settings-item-icon-box blue-lite">
                  <Text className="material-symbols-outlined">calendar_today</Text>
                </View>
                <View className="settings-list-text">
                  <Text className="settings-list-title">最大预约范围</Text>
                  <Text className="settings-list-subtitle">学生最远可预约的时间</Text>
                </View>
              </View>
              <View className="settings-list-value select">
                <Text className="settings-list-value-text">{maxFuture} 天</Text>
                <Text className="material-symbols-outlined settings-select-icon">unfold_more</Text>
              </View>
            </View>
            <View className="settings-list-item no-border">
              <View className="settings-item-left">
                <View className="settings-item-icon-box blue-lite">
                  <Text className="material-symbols-outlined">verified_user</Text>
                </View>
                <View className="settings-list-text">
                  <Text className="settings-list-title">自动接受预约</Text>
                  <Text className="settings-list-subtitle">无需手动确认</Text>
                </View>
              </View>
              <Switch
                checked={autoAccept}
                onChange={(e) => setAutoAccept(e.detail.value)}
                color="#1a73e8"
              />
            </View>
          </View>
        </View>

        <View className="settings-section-card no-padding">
          <Text className="settings-section-heading padding-h">全局规则</Text>
          <View className="settings-list">
            <View className="settings-list-item">
              <View className="settings-list-text no-icon">
                <Text className="settings-list-title">允许24小时内取消</Text>
              </View>
              <Switch
                checked={allowCancel}
                onChange={(e) => setAllowCancel(e.detail.value)}
                color="#e5e7eb"
              />
            </View>
            <View className="settings-list-item no-border">
              <View className="settings-list-text no-icon">
                <Text className="settings-list-title">每日限接5节课</Text>
              </View>
              <Switch
                checked={dailyLimit}
                onChange={(e) => setDailyLimit(e.detail.value)}
                color="#1a73e8"
              />
            </View>
          </View>
        </View>

        <Button className="settings-primary-cta" onClick={handleSave}>
          更新设置
        </Button>
        <Text className="settings-footer-hint">更改将立即应用于所有未来的预约。当前的预约将不受影响。</Text>
      </ScrollView>

      {/* 课程编辑 Modal */}
      {showServiceModal && (
        <View className="settings-modal-overlay">
          <View className="settings-modal">
            <View className="settings-modal-header">
              <Text className="settings-modal-title">{editingService ? '编辑课程' : '添加课程'}</Text>
              <Text className="settings-modal-close" onClick={() => setShowServiceModal(false)}>✕</Text>
            </View>
            <View className="settings-modal-content">
              <View className="settings-modal-form">
                <View className="settings-form-item">
                  <Text className="settings-form-label">课程名称</Text>
                  <Input
                    className="settings-form-input"
                    value={serviceName}
                    onInput={(e) => setServiceName(e.detail.value)}
                    placeholder="如：网球私教课"
                  />
                </View>
                <View className="settings-form-item">
                  <Text className="settings-form-label">课程时长（分钟）</Text>
                  <View className="settings-duration-selector">
                    {[30, 45, 60, 90, 120].map(d => (
                      <View
                        key={d}
                        className={`settings-duration-btn ${serviceDuration === d ? 'active' : ''}`}
                        onClick={() => setServiceDuration(d)}
                      >
                        {d}
                      </View>
                    ))}
                    <Input
                      className="settings-duration-custom"
                      type="number"
                      value={String(serviceDuration)}
                      onInput={(e) => setServiceDuration(Number(e.detail.value))}
                      placeholder="自定义"
                    />
                  </View>
                </View>
                <View className="settings-form-item row">
                  <View>
                    <Text className="settings-form-label">是否有休息间隔</Text>
                    <Text className="settings-form-hint">课程结束后是否留出缓冲时间</Text>
                  </View>
                  <Switch
                    checked={serviceHasGap}
                    onChange={(e) => setServiceHasGap(e.detail.value)}
                    color="#1a73e8"
                  />
                </View>
                {serviceHasGap && (
                  <View className="settings-form-item">
                    <Text className="settings-form-label">课间休息时长</Text>
                    <View className="settings-buffer-row">
                      <Text className="settings-buffer-value">{serviceGapMinutes} 分钟</Text>
                      <Text className="settings-buffer-label">为该课程设置专属缓冲</Text>
                    </View>
                    <Slider
                      className="settings-slider"
                      min={0}
                      max={60}
                      step={5}
                      value={serviceGapMinutes}
                      onChange={(e) => setServiceGapMinutes(e.detail.value)}
                      activeColor="#1a73e8"
                      backgroundColor="#e5e7eb"
                      blockColor="#fff"
                      blockSize={24}
                    />
                    <View className="settings-slider-labels">
                      {[0, 10, 15, 30, 45, 60].map((val) => (
                        <Text
                          key={val}
                          className={`settings-slider-label ${serviceGapMinutes === val ? 'active' : ''}`}
                          onClick={() => setServiceGapMinutes(val)}
                        >
                          {val === 0 ? '无' : `${val} 分钟`}
                        </Text>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </View>
            <View className="settings-modal-actions">
              <Button className="settings-modal-btn cancel" onClick={() => setShowServiceModal(false)}>取消</Button>
              <Button className="settings-modal-btn confirm" onClick={handleSaveService}>保存配置</Button>
            </View>
          </View>
        </View>
      )}

      {/* 底部导航 */}
      <View className="settings-bottom-nav">
        <View className="settings-nav-item" onClick={() => Taro.navigateTo({ url: '/pages/coach/index' })}>
          <Text className="material-symbols-outlined settings-nav-item-icon">calendar_today</Text>
          <Text className="settings-nav-item-text">日程</Text>
        </View>
        <View className="settings-nav-item" onClick={() => Taro.navigateTo({ url: '/pages/students/index' })}>
          <Text className="material-symbols-outlined settings-nav-item-icon">group</Text>
          <Text className="settings-nav-item-text">学员</Text>
        </View>
        <View className="settings-nav-item active">
          <Text className="material-symbols-outlined settings-nav-item-icon">settings</Text>
          <Text className="settings-nav-item-text">设置</Text>
        </View>
      </View>
    </View>
  );
};

export default SettingsPage;
