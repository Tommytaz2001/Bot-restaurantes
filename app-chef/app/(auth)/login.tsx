import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '../../src/store/authStore';
import { BackendConfigModal } from '../../src/components/BackendConfigModal';

export default function LoginScreen() {
  const { login, loading, error } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) return;
    login(email.trim(), password);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {/* Tuerca de configuración */}
      <TouchableOpacity style={styles.gearBtn} onPress={() => setShowConfig(true)} activeOpacity={0.7}>
        <Text style={styles.gearIcon}>⚙</Text>
      </TouchableOpacity>

      <BackendConfigModal visible={showConfig} onClose={() => setShowConfig(false)} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'android' ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Logo area */}
          <View style={styles.logoArea}>
            <View style={styles.logoRing}>
              <View style={styles.logoInner}>
                <Text style={styles.logoEmoji}>🍔</Text>
              </View>
            </View>
            <Text style={styles.brandTop}>URBANO</Text>
            <Text style={styles.brandBottom}>CHEF</Text>
            <View style={styles.dividerLine} />
            <Text style={styles.tagline}>Panel de operaciones</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorIcon}>⚠</Text>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>CORREO ELECTRÓNICO</Text>
              <TextInput
                style={[styles.input, emailFocused && styles.inputFocused]}
                placeholder="chef@urbano.com"
                placeholderTextColor="#3A3A3A"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>CONTRASEÑA</Text>
              <View style={styles.passRow}>
                <TextInput
                  style={[styles.input, styles.passInput, passFocused && styles.inputFocused]}
                  placeholder="••••••••"
                  placeholderTextColor="#3A3A3A"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPassFocused(true)}
                  onBlur={() => setPassFocused(false)}
                  secureTextEntry={!showPass}
                  onSubmitEditing={handleLogin}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.eyeBtn, passFocused && styles.eyeBtnFocused]}
                  onPress={() => setShowPass(!showPass)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.eyeText}>{showPass ? '🙈' : '👁'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#0C0C0C" size="small" />
              ) : (
                <Text style={styles.btnText}>INGRESAR</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>Urbano · Sistema de pedidos</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0C0C0C',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1A1500',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoEmoji: {
    fontSize: 36,
  },
  brandTop: {
    color: '#F59E0B',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
  },
  brandBottom: {
    color: '#F0F0F0',
    fontSize: 15,
    fontWeight: '300',
    letterSpacing: 12,
    marginTop: 2,
  },
  dividerLine: {
    width: 40,
    height: 1,
    backgroundColor: '#2E2E2E',
    marginVertical: 14,
  },
  tagline: {
    color: '#555555',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#161616',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 18,
  },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  errorIcon: {
    fontSize: 16,
    color: '#EF4444',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    flex: 1,
  },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    color: '#555555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  input: {
    backgroundColor: '#1F1F1F',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: '#F0F0F0',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  inputFocused: {
    borderColor: '#F59E0B',
    backgroundColor: '#1A1500',
  },
  passRow: {
    flexDirection: 'row',
    gap: 0,
  },
  passInput: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  eyeBtn: {
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#2E2E2E',
    borderLeftWidth: 0,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeBtnFocused: {
    backgroundColor: '#1A1500',
    borderColor: '#F59E0B',
  },
  eyeText: {
    fontSize: 16,
  },
  btn: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: '#0C0C0C',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 2,
  },
  footer: {
    color: '#333333',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 32,
    letterSpacing: 1,
  },
  gearBtn: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  gearIcon: {
    fontSize: 22,
    color: '#3A3A3A',
  },
});
