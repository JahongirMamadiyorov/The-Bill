import React from 'react';
import { StatusBar, View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';

// ─── Error Boundary ──────────────────────────────────────────────────────────
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#fff7ed', padding: 20, justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#c2410c', marginBottom: 12 }}>
            ⚠️ App Error
          </Text>
          <ScrollView style={{ backgroundColor: '#fff', borderRadius: 10, padding: 14, maxHeight: 400 }}>
            <Text style={{ fontSize: 13, color: '#1e293b', fontFamily: 'monospace' }}>
              {this.state.error?.message ?? 'Unknown error'}
            </Text>
            {this.state.error?.stack ? (
              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 8, fontFamily: 'monospace' }}>
                {this.state.error.stack}
              </Text>
            ) : null}
          </ScrollView>
          <TouchableOpacity
            style={{ marginTop: 20, backgroundColor: '#c2410c', padding: 14, borderRadius: 10, alignItems: 'center' }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          {/* Translucent so every screen's header can draw behind the status bar.
              Each screen overrides barStyle (light-content / dark-content) as needed. */}
          <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
          <AppNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
