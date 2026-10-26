/**
 * 모바일 Supabase 인증: 세션 복원/저장, 이메일 로그인, 역할 해석.
 */
import { createClient, type Session } from '@supabase/supabase-js';
import {clearSession,readRefresh,writeRefresh} from './sessionStorage';
import { AppState } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { fetch } from 'expo/fetch';
import { z } from 'zod';
import { configured, apiUrl, supabaseKey, supabaseUrl } from './config';
import { createForegroundRefreshController } from './platform/securityState';

const client = configured ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true } }) : null;

export async function restorePersistedSession(
  read: () => Promise<string | null>,
  refresh: (token: string) => Promise<{ error: Error | null }>,
  cleanup: () => Promise<void>,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const token = await read();
  if (!isCurrent()) return;
  if (!token) {
    await cleanup();
    return;
  }
  const result = await refresh(token);
  if (!isCurrent()) return;
  if (result.error) {
    await cleanup();
    throw result.error;
  }
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const currentSession = useRef<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState('');
  const lifecycle = useRef({ generation: 0, mounted: false, signingOut: false, writes: Promise.resolve(), operations: Promise.resolve(), operation: null as { generation: number } | null });
  const isCurrent = (generation: number) => lifecycle.current.mounted && lifecycle.current.generation === generation;
  function persist(action: () => Promise<void>): Promise<void> {
    const next = lifecycle.current.writes.then(action);
    lifecycle.current.writes = next.catch(() => {});
    return next;
  }
  // SDK operations can emit auth events before their promises settle. Keep them
  // ordered and ignore events belonging to an operation superseded by user intent.
  function runAuth<T>(generation: number, action: () => Promise<T>): Promise<T | undefined> {
    const next = lifecycle.current.operations.then(async () => {
      if (!isCurrent(generation)) return undefined;
      const operation = { generation };
      lifecycle.current.operation = operation;
      try { return await action(); }
      finally { if (lifecycle.current.operation === operation) lifecycle.current.operation = null; }
    });
    lifecycle.current.operations = next.then(() => {}, () => {});
    return next;
  }
  useEffect(() => {
    const auth = client?.auth;
    if (!auth) return;
    let active = true;
    lifecycle.current.mounted = true;
    const restoreGeneration = lifecycle.current.generation;
    const { data } = auth.onAuthStateChange((event, next) => {
      if (!active) return;
      const operation = lifecycle.current.operation;
      if (operation && operation.generation !== lifecycle.current.generation) return;
      // INITIAL_SESSION is informational; initial restoration owns persisted state.
      if (event === 'INITIAL_SESSION' || (next && lifecycle.current.signingOut)) return;
      const previous = currentSession.current;
      if (event === 'SIGNED_IN' || previous?.user.id !== next?.user.id) lifecycle.current.generation += 1;
      currentSession.current = next;
      setSession(next);
      const generation = lifecycle.current.generation;
      void persist(async () => {
        if (!isCurrent(generation)) return;
        await (next ? writeRefresh(next.refresh_token, next.user.id) : clearSession(previous?.user.id));
      }).catch((caught: unknown) => {
        if (isCurrent(generation)) setError(caught instanceof Error ? caught.message : 'Could not securely save your session.');
      });
    });
    const refreshController = createForegroundRefreshController({
      refresh: async () => {
        const generation = lifecycle.current.generation;
        if (!currentSession.current) return { generation, error: null };
        try {
          const result = await runAuth(generation, () => auth.refreshSession());
          return { generation, error: result?.error ?? null };
        } catch (caught) { return { generation, error: caught }; }
      },
      onSuccess: ({ generation, error: caught }) => {
        if (!isCurrent(generation)) return;
        if (!caught) { setError(''); return; }
        const previous = currentSession.current;
        const cleanupGeneration = ++lifecycle.current.generation;
        currentSession.current = null;
        setSession(null);
        setError(caught instanceof Error ? caught.message : 'Please sign in again.');
        void persist(async () => {
          if (isCurrent(cleanupGeneration)) await clearSession(previous?.user.id);
        }).catch((cleanupError: unknown) => {
          if (isCurrent(cleanupGeneration)) setError(cleanupError instanceof Error ? cleanupError.message : 'Could not securely clear your session.');
        });
      },
      onFailure: () => {},
      startAutoRefresh: () => auth.startAutoRefresh(),
      stopAutoRefresh: () => auth.stopAutoRefresh(),
    }, AppState.currentState === 'active');
    refreshController.start();
    void restorePersistedSession(
      readRefresh,
      async (token) => {
        const result = await runAuth(restoreGeneration, () => auth.refreshSession({ refresh_token: token }));
        return { error: result?.error ?? null };
      },
      () => persist(async () => { if (isCurrent(restoreGeneration)) await clearSession(); }),
      () => isCurrent(restoreGeneration),
    ).catch(async (caught: unknown) => {
      if (isCurrent(restoreGeneration)) setError(caught instanceof Error ? caught.message : 'Please sign in again.');
    }).finally(() => { if (active) setLoading(false); });
    const listener = AppState.addEventListener('change', (state) => {
      void refreshController.setAppState(state);
    });
    return () => { active = false; lifecycle.current.mounted = false; lifecycle.current.generation += 1; data.subscription.unsubscribe(); listener.remove(); refreshController.dispose(); };
  }, []);
  return {
    session, loading, error,
    async submit(email: string, password: string, signup: boolean) {
      if (!client) throw new Error('The service connection is not configured.');
      const generation = ++lifecycle.current.generation;
      lifecycle.current.signingOut = false;
      setError('');
      if (email === 'test') {
        if (signup) throw new Error('Use Sign in for the test account.');
        const response = await fetch(`${apiUrl}/api/demo/login`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:email,password}),signal:AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error(response.status === 401 ? 'Check the test username and password.' : response.status === 429 ? 'Please wait a minute and try again.' : 'The test account is not available yet.');
        const tokens = z.object({access_token:z.string().min(1),refresh_token:z.string().min(1)}).parse(await response.json());
        const result = await runAuth(generation, () => client.auth.setSession(tokens));
        if (!result) return false;
        if (result.error) throw result.error;
        return Boolean(result.data.session);
      }
      const result = await runAuth(generation, () => signup ? client.auth.signUp({ email, password }) : client.auth.signInWithPassword({ email, password }));
      if (!result) return false;
      if (result.error) throw result.error;
      return Boolean(result.data.session);
    },
    async signOut() {
      if (!client) return;
      const generation = ++lifecycle.current.generation;
      lifecycle.current.signingOut = true;
      const accountId = currentSession.current?.user.id;
      currentSession.current = null;
      setSession(null);
      // Reserve cleanup now in the shared storage queue, before a later login write.
      await clearSession(accountId);
      const result = await runAuth(generation, () => client.auth.signOut());
      if (result?.error && isCurrent(generation)) {
        await runAuth(generation, () => client.auth.signOut({ scope: 'local' }));
        if (isCurrent(generation)) setError(result.error.message);
      }
    },
  };
}
