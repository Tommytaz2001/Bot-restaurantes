import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { getBackendUrl, setBackendUrl } from '../services/backendConfig';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved?: (url: string) => void;
}

export function BackendConfigModal({ visible, onClose, onSaved }: Props) {
  const [urlInput, setUrlInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'error' | null>(null);
  const [testMsg, setTestMsg] = useState('');

  useEffect(() => {
    if (visible) {
      getBackendUrl().then(setUrlInput);
      setTestResult(null);
      setTestMsg('');
    }
  }, [visible]);

  const handleSave = async () => {
    if (!urlInput.trim()) return;
    setSaving(true);
    setTestResult(null);
    setTestMsg('');
    const clean = urlInput.trim().replace(/\/$/, '');
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${clean}/whatsapp/status`, { signal: controller.signal }).finally(() => clearTimeout(timer));
      const data = await res.json();
      await setBackendUrl(clean);
      setTestResult('ok');
      setTestMsg(`Conectado · Bot ${data.botActivo ? 'activo' : 'pausado'}`);
      onSaved?.(clean);
      setTimeout(onClose, 1000);
    } catch (err: any) {
      setTestResult('error');
      setTestMsg(`Sin respuesta: ${err?.message ?? 'timeout'}`);
      console.error('[BackendConfig] Error al conectar:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.box}>
          <Text style={styles.title}>Configuración</Text>
          <Text style={styles.label}>URL DEL BACKEND</Text>
          <TextInput
            style={styles.input}
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="http://192.168.1.16:3001"
            placeholderTextColor="#444"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          {testResult && (
            <View style={[styles.feedback, testResult === 'ok' ? styles.feedbackOk : styles.feedbackErr]}>
              <Text style={[styles.feedbackText, testResult === 'ok' ? styles.feedbackTextOk : styles.feedbackTextErr]}>
                {testResult === 'ok' ? '✓ ' : '✗ '}{testMsg}
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn} activeOpacity={0.7} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color="#0C0C0C" />
                : <Text style={styles.saveText}>Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  box: {
    backgroundColor: '#161616',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    gap: 12,
  },
  title: {
    color: '#F0F0F0',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  label: {
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: -4,
  },
  input: {
    backgroundColor: '#0C0C0C',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F0F0F0',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
  },
  cancelText: {
    color: '#555',
    fontWeight: '600',
    fontSize: 14,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
  },
  saveText: {
    color: '#0C0C0C',
    fontWeight: '700',
    fontSize: 14,
  },
  feedback: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  feedbackOk: {
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderColor: 'rgba(52,211,153,0.3)',
  },
  feedbackErr: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '500',
  },
  feedbackTextOk: { color: '#34D399' },
  feedbackTextErr: { color: '#EF4444' },
});
