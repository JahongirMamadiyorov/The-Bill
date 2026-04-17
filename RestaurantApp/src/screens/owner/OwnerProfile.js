import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Switch,
  Platform,
  StatusBar,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { accountingAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing, radius, shadow, topInset } from '../../utils/theme';
import ConfirmDialog from '../../components/ConfirmDialog';

// Constants
const P      = '#7C3AED';
const topPad = topInset;
const PL = '#F5F3FF';

export default function OwnerProfile() {
  const { user, logout } = useAuth();

  // State
  const [settings, setSettings] = useState(null);
  const [taxSettings, setTaxSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dialog, setDialog] = useState(null);

  // Edit fields
  const [restName, setRestName] = useState('');
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);
  const [serviceChargeRate, setServiceChargeRate] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState('');
  const [taxName, setTaxName] = useState('VAT');

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [sRes, tRes] = await Promise.all([
        accountingAPI.getRestaurantSettings(),
        accountingAPI.getTaxSettings(),
      ]);

      const s = sRes.data;
      const t = tRes.data;

      setSettings(s);
      setTaxSettings(t);
      setRestName(s?.restaurant_name || '');
      setServiceChargeEnabled(s?.service_charge_enabled || false);
      setServiceChargeRate(String(s?.service_charge_rate || ''));
      setTaxEnabled(t?.tax_enabled || false);
      setTaxRate(String(t?.tax_rate || ''));
      setTaxName(t?.tax_name || 'VAT');
    } catch (err) {
      setDialog({ title: 'Error', message: err.message || 'Failed to load settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadSettings();
    setRefreshing(false);
  }, [loadSettings]);

  const handleEditPress = () => {
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    if (settings) {
      setRestName(settings.restaurant_name || '');
      setServiceChargeEnabled(settings.service_charge_enabled || false);
      setServiceChargeRate(String(settings.service_charge_rate || ''));
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      await accountingAPI.updateRestaurantSettings({
        restaurant_name: restName,
        service_charge_enabled: serviceChargeEnabled,
        service_charge_rate: parseFloat(serviceChargeRate),
      });
      setDialog({ title: 'Success', message: 'Restaurant settings saved!', type: 'success' });
      setEditMode(false);
      await loadSettings();
    } catch (err) {
      setDialog({ title: 'Error', message: err.message || 'Failed to save settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelTaxEdit = () => {
    if (taxSettings) {
      setTaxEnabled(taxSettings.tax_enabled || false);
      setTaxRate(String(taxSettings.tax_rate || ''));
      setTaxName(taxSettings.tax_name || 'VAT');
    }
  };

  const handleSaveTaxSettings = async () => {
    try {
      setSaving(true);
      await accountingAPI.updateTaxSettings({
        tax_name: taxName,
        tax_rate: parseFloat(taxRate),
        tax_enabled: taxEnabled,
      });
      setDialog({ title: 'Success', message: 'Tax settings saved!', type: 'success' });
      setEditMode(false);
      await loadSettings();
    } catch (err) {
      setDialog({ title: 'Error', message: err.message || 'Failed to save tax settings', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    setDialog({
      title: 'Sign Out',
      message: 'Are you sure?',
      type: 'danger',
      confirmLabel: 'Sign Out',
      onConfirm: () => {
        setDialog(null);
        logout();
      },
    });
  };

  const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getInitial = () => {
    return user?.name ? user.name.charAt(0).toUpperCase() : 'O';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={P} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={P} />
      }
    >
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        {/* decorative circles */}
        <View style={styles.decCircle1} />
        <View style={styles.decCircle2} />
        <View style={{ height: topPad }} />
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{getInitial()}</Text>
        </View>
        <Text style={styles.userName}>{capitalize(user?.name || 'Owner')}</Text>
        {user?.email ? <Text style={styles.userEmail}>{user.email}</Text> : null}
        <View style={styles.roleBadge}>
          <MaterialIcons name="star" size={12} color="#fff" />
          <Text style={styles.roleBadgeText}>OWNER</Text>
        </View>
      </View>

      {/* Restaurant Section */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>RESTAURANT SETTINGS</Text>
        <View style={styles.card}>
          {!editMode ? (
            // View mode
            <>
              <SettingRow
                icon="store"
                label="Restaurant Name"
                value={restName || 'Not set'}
              />
              <Divider />
              <SettingRow
                icon="attach-money"
                label="Service Charge"
                value={
                  serviceChargeEnabled
                    ? `${serviceChargeRate}%`
                    : 'Disabled'
                }
              />
              <Divider />
              <TouchableOpacity
                onPress={handleEditPress}
                style={styles.editButtonContainer}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
            </>
          ) : (
            // Edit mode
            <>
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>Restaurant Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter restaurant name"
                  value={restName}
                  onChangeText={setRestName}
                  placeholderTextColor="#BDBDBD"
                />
              </View>

              <Divider />

              <View style={styles.toggleSection}>
                <View>
                  <Text style={styles.inputLabel}>Service Charge Enabled</Text>
                </View>
                <Switch
                  value={serviceChargeEnabled}
                  onValueChange={setServiceChargeEnabled}
                  trackColor={{ false: '#E0E0E0', true: PL }}
                  thumbColor={serviceChargeEnabled ? P : '#F5F5F5'}
                />
              </View>

              {serviceChargeEnabled && (
                <>
                  <Divider />
                  <View style={styles.inputSection}>
                    <Text style={styles.inputLabel}>Rate (%)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="0"
                      value={serviceChargeRate}
                      onChangeText={setServiceChargeRate}
                      keyboardType="decimal-pad"
                      placeholderTextColor="#BDBDBD"
                    />
                  </View>
                </>
              )}

              <Divider />

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancelEdit}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && { opacity: 0.6 }]}
                  onPress={handleSaveSettings}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Tax Section */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>TAX SETTINGS</Text>
        <View style={styles.card}>
          {!editMode ? (
            // View mode
            <>
              <SettingRow
                icon="percent"
                label="Tax"
                value={
                  taxEnabled
                    ? `${taxName} ${taxRate}%`
                    : 'Disabled'
                }
              />
              <Divider />
              <TouchableOpacity
                onPress={handleEditPress}
                style={styles.editButtonContainer}
              >
                <Text style={styles.editButtonText}>Edit Tax</Text>
              </TouchableOpacity>
            </>
          ) : (
            // Edit mode
            <>
              <View style={styles.toggleSection}>
                <View>
                  <Text style={styles.inputLabel}>Tax Enabled</Text>
                </View>
                <Switch
                  value={taxEnabled}
                  onValueChange={setTaxEnabled}
                  trackColor={{ false: '#E0E0E0', true: PL }}
                  thumbColor={taxEnabled ? P : '#F5F5F5'}
                />
              </View>

              {taxEnabled && (
                <>
                  <Divider />
                  <View style={styles.inputSection}>
                    <Text style={styles.inputLabel}>Tax Name</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="VAT"
                      value={taxName}
                      onChangeText={setTaxName}
                      placeholderTextColor="#BDBDBD"
                    />
                  </View>

                  <Divider />

                  <View style={styles.inputSection}>
                    <Text style={styles.inputLabel}>Tax Rate (%)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="0"
                      value={taxRate}
                      onChangeText={setTaxRate}
                      keyboardType="decimal-pad"
                      placeholderTextColor="#BDBDBD"
                    />
                  </View>
                </>
              )}

              <Divider />

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancelTaxEdit}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && { opacity: 0.6 }]}
                  onPress={handleSaveTaxSettings}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>

      {/* App Info Section */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>APPLICATION</Text>
        <View style={styles.card}>
          <SettingRow icon="info" label="Version" value="1.0.0" />
          <Divider />
          <SettingRow icon="badge" label="Role" value={capitalize(user?.role)} />
          <Divider />
          <SettingRow
            icon="fingerprint"
            label="User ID"
            value={user?.id ? user.id.slice(-8) : 'N/A'}
          />
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.signOutContainer}>
        <TouchableOpacity
          onPress={handleSignOut}
          style={styles.signOutButton}
        >
          <MaterialIcons name="logout" size={20} color="#DC2626" />
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpacer} />
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </ScrollView>
  );
}

// SettingRow Component
function SettingRow({ icon, label, value }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.rowContent}>
        <MaterialIcons name={icon} size={24} color={P} style={styles.rowIcon} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

// Divider Component
function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Profile Header
  profileHeader: {
    backgroundColor: P,
    paddingBottom: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
  },
  decCircle1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -60, right: -50,
  },
  decCircle2: {
    position: 'absolute', width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.05)',
    bottom: 0, left: -20,
  },
  avatarCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 14,
  },
  avatarText: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
  },
  userName: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  userEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 12,
    fontWeight: '500',
  },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },

  // Sections
  sectionContainer: {
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 8,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 14,
    overflow: 'hidden',
    ...shadow.sm,
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  rowValue: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'right',
    maxWidth: 150,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },

  // Edit Button
  editButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: P,
  },

  // Input Section
  inputSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },

  // Toggle Section
  toggleSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveButton: {
    flex: 1,
    backgroundColor: P,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },

  // Sign Out
  signOutContainer: {
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 40,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'white',
    gap: 8,
  },
  signOutButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 40,
  },
});
