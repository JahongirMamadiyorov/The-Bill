import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Dimensions
} from 'react-native';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

export default function KitchenScreen() {
    const { logout } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchOrders = async () => {
        try {
            const response = await api.get('/orders/kitchen');
            setOrders(response.data);
        } catch (err) {
            console.error('Error fetching kitchen orders:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        // Poll every 15 seconds
        const interval = setInterval(fetchOrders, 15000);
        return () => clearInterval(interval);
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchOrders();
    };

    const updateOrderStatus = async (orderId, newStatus) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: newStatus });
            // Optimistically update the UI
            setOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, status: newStatus } : o
            ).filter(o => o.status !== 'ready')); // remove ready orders from KDS view

            // Still fetch the actual data to be sure
            fetchOrders();
        } catch (err) {
            console.error('Failed to update status:', err);
            alert('Failed to update order status');
        }
    };

    const getElapsedTime = (createdAt) => {
        const start = new Date(createdAt).getTime();
        const now = new Date().getTime();
        const diff = Math.floor((now - start) / 60000); // in minutes
        return diff;
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#E74C3C" />
            </View>
        );
    }

    const renderOrderItem = ({ item, index }) => {
        const mins = getElapsedTime(item.created_at);
        const isLate = mins > 15;

        return (
            <View style={[styles.card, isLate && styles.cardLate]}>
                <View style={styles.cardHeader}>
                    <Text style={styles.tableText}>Table {item.table_number}</Text>
                    <Text style={[styles.timeText, isLate && styles.timeTextLate]}>
                        {mins} min
                    </Text>
                </View>

                <View style={styles.waitressRow}>
                    <Text style={styles.waitressText}>Server: {item.waitress_name}</Text>
                </View>

                <View style={styles.itemsContainer}>
                    {item.items && item.items.map((orderItem, idx) => (
                        <View key={idx} style={styles.orderListItem}>
                            <Text style={styles.qtyText}>{orderItem.quantity}x </Text>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.itemName}>{orderItem.item_name}</Text>
                                {orderItem.notes && <Text style={styles.itemNotes}>Note: {orderItem.notes}</Text>}
                            </View>
                        </View>
                    ))}
                </View>

                {item.notes && (
                    <View style={styles.orderNotes}>
                        <Text style={styles.orderNotesText}>Order Note: {item.notes}</Text>
                    </View>
                )}

                <View style={styles.actions}>
                    {(item.status === 'pending' || item.status === 'sent_to_kitchen') ? (
                        <TouchableOpacity
                            style={[styles.button, styles.prepBtn]}
                            onPress={() => updateOrderStatus(item.id, 'preparing')}
                        >
                            <Text style={styles.btnText}>Start Preparing</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={[styles.button, styles.readyBtn]}
                            onPress={() => updateOrderStatus(item.id, 'ready')}
                        >
                            <Text style={styles.btnText}>Mark as Ready</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Kitchen Display System</Text>
                <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={orders}
                keyExtractor={item => item.id.toString()}
                renderItem={renderOrderItem}
                numColumns={isTablet ? 3 : 1}
                key={isTablet ? 'tablet' : 'phone'}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No active orders</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F6FA',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        paddingTop: 50,
        paddingBottom: 15,
        paddingHorizontal: 20,
        backgroundColor: '#2C3E50',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: 'bold',
    },
    logoutBtn: {
        padding: 8,
        backgroundColor: '#E74C3C',
        borderRadius: 5,
    },
    logoutText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    listContent: {
        padding: 10,
    },
    card: {
        backgroundColor: '#FFF',
        borderRadius: 8,
        padding: 15,
        margin: 5,
        flex: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    cardLate: {
        borderLeftWidth: 5,
        borderLeftColor: '#E74C3C',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#EEE',
        paddingBottom: 10,
    },
    tableText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#333',
    },
    timeText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#27AE60',
    },
    timeTextLate: {
        color: '#E74C3C',
    },
    waitressRow: {
        marginBottom: 10,
    },
    waitressText: {
        fontSize: 14,
        color: '#7F8C8D',
    },
    itemsContainer: {
        marginVertical: 10,
    },
    orderListItem: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    qtyText: {
        fontSize: 16,
        fontWeight: 'bold',
        marginRight: 8,
        color: '#2980B9',
    },
    itemName: {
        fontSize: 16,
        color: '#34495E',
    },
    itemNotes: {
        fontSize: 14,
        color: '#E67E22',
        fontStyle: 'italic',
        marginTop: 2,
    },
    orderNotes: {
        backgroundColor: '#FFF3CD',
        padding: 10,
        borderRadius: 5,
        marginBottom: 10,
    },
    orderNotesText: {
        color: '#856404',
        fontStyle: 'italic',
    },
    actions: {
        marginTop: 15,
    },
    button: {
        padding: 15,
        borderRadius: 8,
        alignItems: 'center',
    },
    prepBtn: {
        backgroundColor: '#F39C12',
    },
    readyBtn: {
        backgroundColor: '#27AE60',
    },
    btnText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    emptyContainer: {
        padding: 50,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 18,
        color: '#95A5A6',
    }
});
