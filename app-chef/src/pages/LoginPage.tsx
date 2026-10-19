import React, { useState } from 'react';
import { Lock, Mail, Settings, AlertCircle, Loader2 } from 'lucide-react';
import { login, Usuario } from '../services/api';
import { BackendConfigModal } from '../components/BackendConfigModal';

interface LoginPageProps {
  onLoginSuccess: (user: Usuario) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('chef@urbano.com');
  const [password, setPassword] = useState('chef123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await login(email.trim(), password);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 relative">
      <button
        onClick={() => setShowConfig(true)}
        className="absolute top-5 right-5 p-3 rounded-xl glass-panel text-slate-400 hover:text-white transition-all shadow-lg"
        title="Configurar URL del servidor"
      >
        <Settings className="w-5 h-5" />
      </button>

      <BackendConfigModal isOpen={showConfig} onClose={() => setShowConfig(false)} />

      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-4xl shadow-2xl shadow-orange-500/30 mx-auto mb-4 border border-orange-400/30 animate-bounce-slow">
            🍔
          </div>
          <h1 className="brand-font font-black text-3xl tracking-wider text-white">
            URBANO <span className="text-orange-500">CHEF</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-semibold">
            Panel de Operaciones de Cocina
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel rounded-3xl p-7 shadow-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-xl">
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="chef@urbano.com"
                  required
                  className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-3.5 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-sm shadow-xl shadow-orange-500/25 flex items-center justify-center gap-2 mt-6 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Iniciando sesión...</span>
                </>
              ) : (
                <span>Ingresar a Cocina</span>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-500">
            Usuario por defecto: <span className="text-slate-400 font-mono">chef@urbano.com</span> / <span className="text-slate-400 font-mono">chef123</span>
          </div>
        </div>
      </div>
    </div>
  );
};
