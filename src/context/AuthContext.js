'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  signUp: async () => {},
  signIn: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to fetch the profile from public.users with client-side auto-creation fallback
  const fetchProfile = async (userId, userEmail = '', userName = '') => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user profile:', error.message);
        return;
      }

      if (!data) {
        // Fallback: If no public profile exists (e.g. database trigger delay/lag), insert it now!
        const fallbackName = userName || userEmail?.split('@')[0] || 'User';
        const newProfile = {
          id: userId,
          email: userEmail || '',
          name: fallbackName,
        };
        
        const { data: insertedData, error: insertError } = await supabase
          .from('users')
          .insert([newProfile])
          .select()
          .maybeSingle();

        if (insertError) {
          console.error('Failed to auto-create user profile:', insertError.message);
        } else if (insertedData) {
          setProfile(insertedData);
        }
      } else {
        setProfile(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    }
  };

  useEffect(() => {
    // 1. Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata?.name
          );
        }
      } catch (err) {
        console.error('Error getting session:', err);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // 2. Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(
            session.user.id,
            session.user.email,
            session.user.user_metadata?.name
          );
        } else {
          setUser(null);
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const signUp = async (email, password, name) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0],
        },
      },
    });

    if (error) {
      setLoading(false);
      throw error;
    }

    if (data?.user) {
      setUser(data.user);
      // Wait briefly, then fetch/ensure the profile is created
      setTimeout(() => {
        fetchProfile(
          data.user.id,
          data.user.email,
          data.user.user_metadata?.name || name
        );
        setLoading(false);
      }, 1000);
    } else {
      setLoading(false);
    }

    return data;
  };

  const signIn = async (email, password) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      throw error;
    }

    if (data?.user) {
      setUser(data.user);
      await fetchProfile(
        data.user.id,
        data.user.email,
        data.user.user_metadata?.name
      );
    }
    setLoading(false);
    return data;
  };

  const signOut = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLoading(false);
      throw error;
    }
    setUser(null);
    setProfile(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
