import { useState, useEffect, useCallback } from 'react';
import { Mail, Phone, MapPin, Lock, Save, User, AlertCircle, Check } from 'lucide-react';
import { accountingAPI, usersAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Dropdown from '../../components/Dropdown';
import PhoneInput, { formatPhoneDisplay } from '../../components/PhoneInput';

export default function OwnerProfile() {
  const { user: authUser, updateUser } = useAuth();
  const [user, setUser] = useState({
    name: '',
    email: '',
    role: '',
    phone: '',
  });
  const [restaurantSettings, setRestaurantSettings] = useState(null);
  const [taxSettings, setTaxSettings] = useState(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingRestaurant, setSavingRestaurant] = useState(false);
  const [savingTax, setSavingTax] = useState(false);

  const fetchProfileData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [settings, taxes, freshUser] = await Promise.all([
        accountingAPI.getRestaurantSettings(),
        accountingAPI.getTaxSettings(),
        usersAPI.getMe().catch(() => null),
      ]);
      if (freshUser && freshUser.id) {
        updateUser(freshUser);
        setUser(freshUser);
      } else {
        const storedUser = authUser || JSON.parse(localStorage.getItem('user') || '{}');
        setUser(storedUser);
      }
      setRestaurantSettings(settings);
      setTaxSettings(taxes);
      setError(null);
    } catch (err) {
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    fetchProfileData();
    const t = setInterval(() => fetchProfileData(true), 1000);
    return () => clearInterval(t);
  }, [fetchProfileData]);

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleUpdateProfile = async () => {
    try {
      setSavingProfile(true);
      setError(null);
      const updated = await usersAPI.update(authUser.id, { name: user.name, phone: user.phone });
      updateUser({ name: updated.name || user.name, phone: updated.phone || user.phone });
      showSuccess('Profile updated successfully');
    } catch (err) {
      setError(err?.error || err?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setSavingPassword(true);
      setError(null);
      await usersAPI.updateCredentials(authUser.id, {
        password: passwordForm.newPassword,
        confirm_password: passwordForm.confirmPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showSuccess('Password changed successfully');
    } catch (err) {
      setError(err?.error || err?.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveRestaurantSettings = async () => {
    if (!restaurantSettings) return;
    try {
      setSavingRestaurant(true);
      setError(null);
      await accountingAPI.updateRestaurantSettings(restaurantSettings);
      showSuccess('Restaurant settings updated');
    } catch (err) {
      setError(err?.error || err?.message || 'Failed to update restaurant settings');
    } finally {
      setSavingRestaurant(false);
    }
  };

  const handleSaveTaxSettings = async () => {
    if (!taxSettings) return;
    try {
      setSavingTax(true);
      setError(null);
      await accountingAPI.updateTaxSettings(taxSettings);
      showSuccess('Tax settings updated');
    } catch (err) {
      setError(err?.error || err?.message || 'Failed to update tax settings');
    } finally {
      setSavingTax(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-2">
          <User className="w-8 h-8" style={{ color: '#7C3AED' }} />
          Profile & Settings
        </h1>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              &times;
            </button>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3 text-green-700">
            <Check className="w-5 h-5 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-purple-600 font-bold text-2xl">
                {user.name?.charAt(0).toUpperCase() || 'O'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center">{user.name || 'Owner'}</h2>
            <p className="text-sm text-gray-600 text-center mt-2">{user.role || 'Restaurant Owner'}</p>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-600 mb-4">Contact Information</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-medium text-gray-900">{user.email || 'Not provided'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Phone</p>
                  <p className="text-sm font-medium text-gray-900">{formatPhoneDisplay(user.phone) || 'Not provided'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-600 mb-4">Restaurant Info</h3>
            <div className="space-y-4">
              {restaurantSettings ? (
                <>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Name</p>
                    <p className="text-sm font-medium text-gray-900">{restaurantSettings.restaurantName}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Address</p>
                      <p className="text-sm font-medium text-gray-900">{restaurantSettings.address}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500">No restaurant info available</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Personal Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={user.name || ''}
                  onChange={(e) => setUser({ ...user, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={user.email || ''}
                  onChange={(e) => setUser({ ...user, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <PhoneInput
                  value={user.phone || ''}
                  onChange={(formattedPhone) => setUser({ ...user, phone: formattedPhone })}
                  label="Phone Number"
                  size="md"
                />
              </div>

              <button
                onClick={handleUpdateProfile}
                disabled={savingProfile}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Change Password</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Min 6 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Repeat password"
                />
              </div>

              <button
                onClick={handleChangePassword}
                disabled={savingPassword}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                {savingPassword ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {restaurantSettings && (
            <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Restaurant Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name</label>
                  <input
                    type="text"
                    value={restaurantSettings.restaurantName || ''}
                    onChange={(e) =>
                      setRestaurantSettings({ ...restaurantSettings, restaurantName: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Address</label>
                  <textarea
                    value={restaurantSettings.address || ''}
                    onChange={(e) =>
                      setRestaurantSettings({ ...restaurantSettings, address: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows="3"
                  />
                </div>

                <div>
                  <PhoneInput
                    value={restaurantSettings.phone || ''}
                    onChange={(formattedPhone) =>
                      setRestaurantSettings({ ...restaurantSettings, phone: formattedPhone })
                    }
                    label="Phone Number"
                    size="md"
                  />
                </div>

                <button
                  onClick={handleSaveRestaurantSettings}
                  disabled={savingRestaurant}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {savingRestaurant ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}

          {taxSettings && (
            <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Tax Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID / EIN</label>
                  <input
                    type="text"
                    value={taxSettings.taxId || ''}
                    onChange={(e) => setTaxSettings({ ...taxSettings, taxId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    value={taxSettings.taxRate || 0}
                    onChange={(e) =>
                      setTaxSettings({ ...taxSettings, taxRate: parseFloat(e.target.value) })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax Filing Frequency</label>
                  <Dropdown
                    value={taxSettings.filingFrequency || 'monthly'}
                    onChange={(value) => setTaxSettings({ ...taxSettings, filingFrequency: value })}
                    options={[
                      { value: 'monthly', label: 'Monthly' },
                      { value: 'quarterly', label: 'Quarterly' },
                      { value: 'annually', label: 'Annually' },
                    ]}
                  />
                </div>

                <button
                  onClick={handleSaveTaxSettings}
                  disabled={savingTax}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {savingTax ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
