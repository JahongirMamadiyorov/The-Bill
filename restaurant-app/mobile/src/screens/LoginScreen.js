import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return Alert.alert('Error', 'Please fill in all fields');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      Alert.alert('Login Failed', err.response?.data?.error || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.logo}>🍽</Text>
        <Text style={styles.title}>Restaurant App</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', justifyContent: 'center', padding: 24 },
  card:      { backgroundColor: '#fff', borderRadius: 16, padding: 28, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  logo:      { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  title:     { fontSize: 26, fontWeight: 'bold', textAlign: 'center', color: '#1A1A1A' },
  subtitle:  { fontSize: 14, textAlign: 'center', color: '#888', marginBottom: 28 },
  input:     { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 14, marginBottom: 14, fontSize: 15, backgroundColor: '#FAFAFA' },
  button:    { backgroundColor: '#E74C3C', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 6 },
  buttonText:{ color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
