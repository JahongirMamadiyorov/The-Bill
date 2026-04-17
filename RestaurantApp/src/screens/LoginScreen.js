import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  StatusBar,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing, radius, shadow, typography } from '../utils/theme';

// Detect what kind of identifier the user typed so we can show a helpful hint.
// The actual detection + routing logic lives in the backend — this is UI only.
function detectType(input) {
  if (!input) return null;
  if (input.includes('@')) return 'email';
  if (/^\+?\d[\d\s\-()+]*$/.test(input.trim())) return 'phone';
  return 'username';
}

// Format phone digits as XX XXX XX XX
function formatPhoneLocal(raw) {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('998') ? digits.slice(3) : digits;
  const d = local.slice(0, 9);
  let out = '';
  if (d.length > 0) out += d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}

export default function LoginScreen() {
  const { login }                       = useAuth();
  const [identifier, setIdentifier]     = useState('');
  const [rawPhone, setRawPhone]         = useState('');
  const [password, setPassword]         = useState('');
  const [loading, setLoading]           = useState(false);
  const [showPass, setShowPass]         = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');

  const handleIdentifierChange = (val) => {
    setErrorMsg('');
    const type = detectType(val);
    if (type === 'phone') {
      const digits = val.replace(/\D/g, '');
      const local = digits.startsWith('998') ? digits.slice(3) : digits;
      setRawPhone(local.slice(0, 9));
      setIdentifier(formatPhoneLocal(val));
    } else {
      setRawPhone('');
      setIdentifier(val);
    }
  };

  // Build the actual identifier to send to backend
  const idType = detectType(identifier);
  const getLoginIdentifier = () => {
    if (idType === 'phone') {
      return '+998' + rawPhone;
    }
    return identifier.trim();
  };

  const handleLogin = async () => {
    setErrorMsg('');
    if (!identifier.trim()) {
      setErrorMsg('Please enter your phone, email or username.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }
    setLoading(true);
    try {
      await login(getLoginIdentifier(), password);
    } catch (err) {
      const msg  = err.response?.data?.error || '';
      const code = err.response?.data?.code  || '';
      if (msg.toLowerCase().includes('suspend') || msg.toLowerCase().includes('inactive')) {
        setErrorMsg('Your account has been suspended. Contact your manager.');
      } else if (code === 'NOT_FOUND') {
        setErrorMsg('Account not found. Check your phone, email or username.');
      } else if (code === 'WRONG_PASSWORD') {
        setErrorMsg('Wrong password. Please try again.');
      } else if (err.response?.status === 400) {
        setErrorMsg('Please fill in all fields.');
      } else if (!err.response) {
        setErrorMsg('Cannot reach the server. Check your network connection.');
      } else {
        setErrorMsg('Login failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Show a small hint under the input so users know what type they are entering
  const hintMap = { email: 'Signing in with email', phone: 'Signing in with phone number', username: 'Signing in with username' };
  const hint = idType ? hintMap[idType] : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>R</Text>
          </View>
          <Text style={styles.appName}>RestaurantApp</Text>
          <Text style={styles.tagline}>Management System</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>
          <Text style={styles.subtitle}>Enter your phone, email or username</Text>

          {/* Error banner */}
          {!!errorMsg && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorTxt}>{errorMsg}</Text>
            </View>
          )}

          {/* Universal identifier input */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Phone, Email or Username</Text>
            <View style={idType === 'phone' ? styles.phoneRow : undefined}>
              {idType === 'phone' && (
                <View style={styles.phonePrefix}>
                  <Text style={styles.phonePrefixFlag}>UZ</Text>
                  <Text style={styles.phonePrefixCode}>+998</Text>
                </View>
              )}
              <TextInput
                style={[styles.input, idType === 'phone' && styles.phoneInput]}
                placeholder="Phone, email or username"
                placeholderTextColor={colors.textMuted}
                keyboardType={idType === 'phone' ? 'phone-pad' : 'email-address'}
                value={identifier}
                onChangeText={handleIdentifierChange}
                autoCorrect={false}
                autoCapitalize="none"
                textContentType="username"
              />
            </View>
            {!!hint && <Text style={[styles.inputHint, idType === 'phone' && { color: '#2563eb' }]}>{hint}</Text>}
          </View>

          {/* Password */}
          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPass}
                value={password}
                onChangeText={(t) => { setErrorMsg(''); setPassword(t); }}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPass(v => !v)}>
                <Text style={styles.eyeText}>{showPass ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Button */}
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.buttonText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>Restaurant Management System v1.0</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner:     { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },

  logoContainer: { alignItems: 'center', marginBottom: spacing.xxl },
  logoBox:       { width: 72, height: 72, borderRadius: radius.xl, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, ...shadow.lg },
  logoText:      { fontSize: 36, fontWeight: '800', color: colors.white },
  appName:       { fontSize: 24, fontWeight: '800', color: colors.textDark, letterSpacing: -0.5 },
  tagline:       { fontSize: 13, color: colors.textMuted, marginTop: 2, letterSpacing: 1, textTransform: 'uppercase' },

  card:     { backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.xxl, ...shadow.lg },
  title:    { fontSize: typography.xxl, fontWeight: '800', color: colors.textDark, marginBottom: 4 },
  subtitle: { fontSize: typography.sm, color: colors.textMuted, marginBottom: spacing.lg },

  errorBanner: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorTxt:    { color: '#DC2626', fontSize: typography.sm, fontWeight: '600', textAlign: 'center' },

  inputWrapper: { marginBottom: spacing.lg },
  label:        { fontSize: typography.xs, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  input:        { backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.lg, fontSize: 15, color: colors.textDark },
  inputHint:    { fontSize: 11, color: colors.primary, marginTop: 4, fontWeight: '600', letterSpacing: 0.2 },
  phoneRow:     { flexDirection: 'row', alignItems: 'stretch' },
  phonePrefix:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderRightWidth: 0, borderColor: colors.border, borderTopLeftRadius: radius.md, borderBottomLeftRadius: radius.md },
  phonePrefixFlag: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  phonePrefixCode: { fontSize: 14, fontWeight: '700', color: '#374151' },
  phoneInput:   { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  passwordRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyeBtn:       { paddingHorizontal: spacing.md, paddingVertical: spacing.lg, backgroundColor: colors.background, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  eyeText:      { fontSize: 13, color: colors.textMuted, fontWeight: '600' },

  button:         { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.lg, alignItems: 'center', marginTop: spacing.md, ...shadow.md },
  buttonDisabled: { opacity: 0.7 },
  buttonText:     { color: colors.white, fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },

  footer: { textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: spacing.xl },
});
