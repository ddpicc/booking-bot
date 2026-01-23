import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Input, Image, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useStore } from '../../store';
import { callService } from '../../utils';
import './index.css';

const StudentsPage: React.FC = () => {
    const { students, setStudents, updateStudent, currentUser } = useStore();
    const router = Taro.useRouter();
    const coachId = router.params.coachId || currentUser?.coachId || '';
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('全部');
    const [loading, setLoading] = useState(false);

    // Modal states
    const [showAddModal, setShowAddModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPhone, setNewPhone] = useState('');
    const [newCourse, setNewCourse] = useState('');
    const [newHours, setNewHours] = useState('0');
    const [newPrice, setNewPrice] = useState('0.00');

    const filters = ['全部', '羽毛球', '网球', '游泳', '篮球'];

    React.useEffect(() => {
        if (coachId) fetchStudents();
    }, [coachId]);

    const fetchStudents = async () => {
        setLoading(true);
        try {
            const res = await callService('students', 'list', { coachId }) as any;
            if (res?.data?.ok) {
                const normalized = (res.data.data || []).map((item: any) => ({
                    ...item,
                    id: item._id || item.id,
                }));
                setStudents(normalized);
            } else {
                console.warn('[Students] List failed', res);
            }
        } catch (error) {
            console.error('Fetch students error:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredStudents = useMemo(() => {
        return students.filter(s => {
            const matchesSearch = (s.name || '').includes(searchQuery) || (s.phoneNumber || '').includes(searchQuery);
            const matchesFilter = selectedFilter === '全部' || s.sportType === selectedFilter;
            return matchesSearch && matchesFilter;
        });
    }, [students, searchQuery, selectedFilter]);

    const lowHoursCount = useMemo(() => {
        return students.filter(s => s.remainingHours <= 3).length;
    }, [students]);

    const handleQuickDeduct = async (studentId: string, name: string) => {
        Taro.showModal({
            title: '确认扣课',
            content: `确定为学员【${name}】核销 1 课时吗？`,
            success: async (res) => {
                if (res.confirm) {
                    Taro.showLoading({ title: '核销中...' });
                    try {
                        const result = await callService('booking', 'deduct', {
                            studentId: studentId,
                            hours: 1
                        }) as any;
                        if (result?.data?.ok) {
                            // 直接刷新列表，避免本地课时不同步
                            fetchStudents();
                            Taro.showToast({ title: '核销成功', icon: 'success' });
                        } else {
                            Taro.showToast({ title: (result?.data as any)?.message || '核销失败', icon: 'none' });
                        }
                    } catch (error) {
                        Taro.showToast({ title: '系统错误', icon: 'none' });
                    } finally {
                        Taro.hideLoading();
                    }
                }
            }
        });
    };

    const handleAddStudent = async () => {
        if (!newName.trim() || !newPhone.trim()) {
            Taro.showToast({ title: '请填写姓名和电话', icon: 'none' });
            return;
        }

        Taro.showLoading({ title: '保存中...' });
        try {
            const result = await callService('students', 'create', {
                coachId,
                name: newName,
                phoneNumber: newPhone,
                courseName: newCourse || '未设置课程',
                remainingHours: Number(newHours),
                totalHours: Number(newHours),
                unitPrice: Number(newPrice),
                sportType: selectedFilter === '全部' ? '羽毛球' : selectedFilter,
                avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100'
            }) as any;
            if (result?.data?.ok) {
                Taro.showToast({ title: '添加成功', icon: 'success' });
                setShowAddModal(false);
                resetForm();
                fetchStudents();
            } else {
                Taro.showToast({ title: (result?.data as any)?.message || '添加失败', icon: 'none' });
            }
        } catch (error) {
            Taro.showToast({ title: '添加失败', icon: 'none' });
        } finally {
            Taro.hideLoading();
        }
    };

    const resetForm = () => {
        setNewName('');
        setNewPhone('');
        setNewCourse('');
        setNewHours('0');
        setNewPrice('0.00');
    };

    return (
        <View className="students-page">
            <View className="students-header">
                <View className="students-header-top">
                    <Text className="students-title">学员管理</Text>
                    <View className="students-add-icon" onClick={() => setShowAddModal(true)}>
                        <Text className="material-symbols-outlined">person_add</Text>
                    </View>
                </View>

                <View className="students-search-box">
                    <Text className="material-symbols-outlined search-icon">search</Text>
                    <Input
                        className="students-search-input"
                        placeholder="搜索学员姓名或电话"
                        value={searchQuery}
                        onInput={(e) => setSearchQuery(e.detail.value)}
                    />
                </View>

                {lowHoursCount > 0 && (
                    <View className="students-alert-bar">
                        <Text className="material-symbols-outlined alert-icon">error</Text>
                        <Text className="alert-text">{lowHoursCount}位学员课时不足</Text>
                    </View>
                )}

                <ScrollView scrollX className="filter-scroll" showScrollbar={false}>
                    <View className="filter-row">
                        {filters.map(f => (
                            <View
                                key={f}
                                className={`filter-chip ${selectedFilter === f ? 'active' : ''}`}
                                onClick={() => setSelectedFilter(f)}
                            >
                                <Text>{f}</Text>
                            </View>
                        ))}
                    </View>
                </ScrollView>
            </View>

            <ScrollView className="students-list-scroll">
                <View className="students-list">
                    {filteredStudents.map(student => (
                        <View key={student.id} className="student-card">
                            <View className="student-card-left">
                                <View className="student-avatar-box">
                                    <Image className="student-avatar" src={student.avatar || ''} mode="aspectFill" />
                                    <View className={`status-dot ${student.remainingHours <= 3 ? 'warning' : 'active'}`} />
                                </View>
                                <View className="student-info">
                                    <View className="student-name-row">
                                        <Text className="student-name">{student.name}</Text>
                                        <View className="sport-tag">{student.sportType}</View>
                                    </View>
                                    <View className="student-course-row">
                                        <Text className="student-course">课程：{student.courseName}</Text>
                                    </View>
                                    <View className={`student-hours ${student.remainingHours <= 3 ? 'low' : ''}`}>
                                        <Text>剩余 {student.remainingHours} 课时</Text>
                                    </View>
                                </View>
                            </View>
                            <View className="student-card-right">
                                <View className="quick-action" onClick={(e) => {
                                    e.stopPropagation();
                                    handleQuickDeduct(String(student._id || student.id), student.name);
                                }}>
                                    <Text className="material-symbols-outlined action-icon">check_circle</Text>
                                    <Text className="action-label">一键扣课</Text>
                                </View>
                                <Text className="material-symbols-outlined chevron-icon">chevron_right</Text>
                            </View>
                        </View>
                    ))}
                    {filteredStudents.length === 0 && !loading && (
                        <View className="empty-state">
                            <Text>未找到相关学员</Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            <View className="students-bottom-nav">
                <View className="nav-item" onClick={() => Taro.navigateTo({ url: '/pages/coach/index' })}>
                    <Text className="material-symbols-outlined">calendar_today</Text>
                    <Text className="nav-text">排课</Text>
                </View>
                <View className="nav-item active">
                    <Text className="material-symbols-outlined">group</Text>
                    <Text className="nav-text">学员</Text>
                </View>
                <View className="nav-item" onClick={() => Taro.navigateTo({ url: '/pages/settings/index' })}>
                    <Text className="material-symbols-outlined">settings</Text>
                    <Text className="nav-text">我的</Text>
                </View>
            </View>

            {showAddModal && (
                <View className="add-modal-overlay">
                    <View className="add-modal">
                        <View className="add-modal-header">
                            <Text className="add-modal-title">添加学员</Text>
                            <Text className="material-symbols-outlined close-icon" onClick={() => setShowAddModal(false)}>close</Text>
                        </View>
                        <View className="add-modal-form">
                            <View className="form-item">
                                <Text className="form-label">姓名</Text>
                                <Input
                                    className="form-input"
                                    placeholder="请输入学员姓名"
                                    value={newName}
                                    onInput={(e) => setNewName(e.detail.value)}
                                />
                            </View>
                            <View className="form-item">
                                <Text className="form-label">联系电话</Text>
                                <Input
                                    className="form-input"
                                    placeholder="请输入手机号码"
                                    value={newPhone}
                                    onInput={(e) => setNewPhone(e.detail.value)}
                                />
                            </View>
                            <View className="form-item">
                                <Text className="form-label">课程名称</Text>
                                <Input
                                    className="form-input"
                                    placeholder="例如：网球进阶班"
                                    value={newCourse}
                                    onInput={(e) => setNewCourse(e.detail.value)}
                                />
                            </View>
                            <View className="form-row">
                                <View className="form-item half">
                                    <Text className="form-label">购买课时</Text>
                                    <Input
                                        className="form-input"
                                        type="number"
                                        value={newHours}
                                        onInput={(e) => setNewHours(e.detail.value)}
                                    />
                                </View>
                                <View className="form-item half">
                                    <Text className="form-label">课程单价</Text>
                                    <Input
                                        className="form-input"
                                        type="digit"
                                        value={newPrice}
                                        onInput={(e) => setNewPrice(e.detail.value)}
                                    />
                                </View>
                            </View>
                            <Button className="save-btn" onClick={handleAddStudent}>
                                <Text className="material-symbols-outlined">save</Text>
                                <Text>保存学员信息</Text>
                            </Button>
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
};

export default StudentsPage;
