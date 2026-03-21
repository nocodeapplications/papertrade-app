import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const UserContext = createContext(null);

const STARTING_CASH = 10000;
const AI_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function storageKey(username, dataKey) {
  return `pt_${username}_${dataKey}`;
}

function loadUserData(username) {
  try {
    const raw = localStorage.getItem(storageKey(username, 'data'));
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    cash: STARTING_CASH,
    longs: {},
    shortPos: {},
    history: [],
    theme: 'warmgray',
    aiCache: null,
    cryptoCache: null,
  };
}

function saveUserData(username, data) {
  try {
    localStorage.setItem(storageKey(username, 'data'), JSON.stringify(data));
  } catch {}
}

function getUsers() {
  try {
    return JSON.parse(localStorage.getItem('pt_users') || '{}');
  } catch { return {}; }
}

function saveUsers(users) {
  try {
    localStorage.setItem('pt_users', JSON.stringify(users));
  } catch {}
}

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);

  // Restore session on mount
  useEffect(() => {
    const session = localStorage.getItem('pt_session');
    if (session) {
      const users = getUsers();
      if (users[session]) {
        const data = loadUserData(session);
        setCurrentUser(session);
        setUserData(data);
        applyTheme(data.theme || 'warmgray');
      }
    }
  }, []);

  const register = useCallback((username, password) => {
    const users = getUsers();
    if (!username.trim() || username.length < 3) return 'Username must be at least 3 characters.';
    if (!password || password.length < 4) return 'Password must be at least 4 characters.';
    if (users[username.toLowerCase()]) return 'Username already taken.';
    users[username.toLowerCase()] = { passwordHash: btoa(password), createdAt: Date.now() };
    saveUsers(users);
    const data = loadUserData(username.toLowerCase());
    saveUserData(username.toLowerCase(), data);
    localStorage.setItem('pt_session', username.toLowerCase());
    setCurrentUser(username.toLowerCase());
    setUserData(data);
    applyTheme(data.theme || 'warmgray');
    return null;
  }, []);

  const login = useCallback((username, password) => {
    const users = getUsers();
    const u = users[username.toLowerCase()];
    if (!u) return 'User not found.';
    if (u.passwordHash !== btoa(password)) return 'Incorrect password.';
    const data = loadUserData(username.toLowerCase());
    localStorage.setItem('pt_session', username.toLowerCase());
    setCurrentUser(username.toLowerCase());
    setUserData(data);
    applyTheme(data.theme || 'warmgray');
    return null;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('pt_session');
    setCurrentUser(null);
    setUserData(null);
    applyTheme('warmgray');
  }, []);

  const updateData = useCallback((updater) => {
    setUserData(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      saveUserData(currentUser, next);
      return next;
    });
  }, [currentUser]);

  const setTheme = useCallback((theme) => {
    applyTheme(theme);
    updateData({ theme });
  }, [updateData]);

  function applyTheme(theme) {
    if (theme === 'warmgray') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }

  // Cache helpers
  const getAICache = useCallback(() => {
    if (!userData?.aiCache) return null;
    if (Date.now() - userData.aiCache.ts > AI_CACHE_TTL_MS) return null;
    return userData.aiCache.data;
  }, [userData]);

  const setAICache = useCallback((data) => {
    updateData(prev => ({ ...prev, aiCache: { ts: Date.now(), data } }));
  }, [updateData]);

  const getCryptoCache = useCallback(() => {
    if (!userData?.cryptoCache) return null;
    if (Date.now() - userData.cryptoCache.ts > AI_CACHE_TTL_MS) return null;
    return userData.cryptoCache.data;
  }, [userData]);

  const setCryptoCache = useCallback((data) => {
    updateData(prev => ({ ...prev, cryptoCache: { ts: Date.now(), data } }));
  }, [updateData]);

  const getUserCount = () => Object.keys(getUsers()).length;

  return (
    <UserContext.Provider value={{
      currentUser, userData, register, login, logout,
      updateData, setTheme,
      getAICache, setAICache, getCryptoCache, setCryptoCache,
      getUserCount,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() { return useContext(UserContext); }
