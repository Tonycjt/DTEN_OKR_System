"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { currentUserId, users } from "@/mock-data";
import type { User } from "@/types";

const storageKey = "dten-weekly-execution-mock-user-id";
export const mockSessionEvent = "dten-mock-session-updated";

type MockSessionContextValue = {
  activeUser: User;
  activeUserId: string;
  setActiveUserId: (userId: string) => void;
};

const MockSessionContext = createContext<MockSessionContextValue | null>(null);

export function getMockSessionUserId() {
  if (typeof window === "undefined") {
    return currentUserId;
  }

  return normalizeMockUserId(window.localStorage.getItem(storageKey));
}

export function getMockSessionUser(): User {
  const userId = getMockSessionUserId();
  return getUserById(userId);
}

export function setMockSessionUserId(userId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKey, normalizeMockUserId(userId));
  window.dispatchEvent(new Event(mockSessionEvent));
}

export function MockSessionProvider({ children }: { children: ReactNode }) {
  const [activeUserId, setActiveUserIdState] = useState(currentUserId);

  useEffect(() => {
    const refreshUserId = () => setActiveUserIdState(getMockSessionUserId());
    refreshUserId();
    window.addEventListener(mockSessionEvent, refreshUserId);
    window.addEventListener("storage", refreshUserId);

    return () => {
      window.removeEventListener(mockSessionEvent, refreshUserId);
      window.removeEventListener("storage", refreshUserId);
    };
  }, []);

  const value = useMemo<MockSessionContextValue>(() => {
    const normalizedActiveUserId = normalizeMockUserId(activeUserId);

    return {
      activeUser: getUserById(normalizedActiveUserId),
      activeUserId: normalizedActiveUserId,
      setActiveUserId: setMockSessionUserId,
    };
  }, [activeUserId]);

  return createElement(MockSessionContext.Provider, { value }, children);
}

export function useMockSession() {
  const context = useContext(MockSessionContext);

  if (!context) {
    return {
      activeUser: getMockSessionUser(),
      activeUserId: getMockSessionUserId(),
      setActiveUserId: setMockSessionUserId,
    };
  }

  return context;
}

export function useMockSessionUser() {
  return useMockSession().activeUser;
}

function normalizeMockUserId(userId: string | null | undefined) {
  if (!userId) {
    return currentUserId;
  }

  return users.some((user) => user.id === userId) ? userId : currentUserId;
}

function getUserById(userId: string): User {
  return users.find((user) => user.id === userId) ?? users.find((user) => user.id === currentUserId) ?? users[0];
}
