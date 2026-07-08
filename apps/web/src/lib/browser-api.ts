/**
 * Browser API helpers that safely handle environments where browser APIs
 * may not be available (SSR, worker threads, etc.)
 */

export const BrowserAPI = {
  /**
   * Check if code is running in a browser environment
   */
  isClient(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
  },

  /**
   * Get a value from localStorage safely
   */
  getLocalStorage(key: string): string | null {
    try {
      if (!this.isClient()) return null;
      return window.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Set a value in localStorage safely
   */
  setLocalStorage(key: string, value: string): boolean {
    try {
      if (!this.isClient()) return false;
      window.localStorage?.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Remove a value from localStorage safely
   */
  removeLocalStorage(key: string): boolean {
    try {
      if (!this.isClient()) return false;
      window.localStorage?.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get a value from sessionStorage safely
   */
  getSessionStorage(key: string): string | null {
    try {
      if (!this.isClient()) return null;
      return window.sessionStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },

  /**
   * Set a value in sessionStorage safely
   */
  setSessionStorage(key: string, value: string): boolean {
    try {
      if (!this.isClient()) return false;
      window.sessionStorage?.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Remove a value from sessionStorage safely
   */
  removeSessionStorage(key: string): boolean {
    try {
      if (!this.isClient()) return false;
      window.sessionStorage?.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get window.location.origin safely
   */
  getOrigin(): string {
    try {
      if (!this.isClient()) return "";
      return window.location?.origin ?? "";
    } catch {
      return "";
    }
  },

  /**
   * Get window.location.pathname safely
   */
  getPathname(): string {
    try {
      if (!this.isClient()) return "";
      return window.location?.pathname ?? "";
    } catch {
      return "";
    }
  },

  /**
   * Get window.location.search safely
   */
  getSearch(): string {
    try {
      if (!this.isClient()) return "";
      return window.location?.search ?? "";
    } catch {
      return "";
    }
  },

  /**
   * Get window.location.href safely
   */
  getHref(): string {
    try {
      if (!this.isClient()) return "";
      return window.location?.href ?? "";
    } catch {
      return "";
    }
  },

  /**
   * Navigate to a URL safely
   */
  navigate(url: string): void {
    try {
      if (!this.isClient()) return;
      window.location?.assign(url);
    } catch {
      // Silently fail
    }
  },

  /**
   * Reload the page safely
   */
  reload(): void {
    try {
      if (!this.isClient()) return;
      window.location?.reload();
    } catch {
      // Silently fail
    }
  },

  /**
   * Replace browser history safely
   */
  replaceHistory(url: string): void {
    try {
      if (!this.isClient()) return;
      window.history?.replaceState(null, "", url);
    } catch {
      // Silently fail
    }
  },

  /**
   * Schedule a function to run after a delay safely
   */
  setTimeout(callback: () => void, ms: number): number {
    try {
      if (!this.isClient()) return -1;
      return window.setTimeout?.(callback, ms) ?? -1;
    } catch {
      return -1;
    }
  },

  /**
   * Cancel a scheduled function safely
   */
  clearTimeout(timerId: number): void {
    try {
      if (!this.isClient() || timerId < 0) return;
      window.clearTimeout?.(timerId);
    } catch {
      // Silently fail
    }
  },

  /**
   * Set an interval safely
   */
  setInterval(callback: () => void, ms: number): number {
    try {
      if (!this.isClient()) return -1;
      return window.setInterval?.(callback, ms) ?? -1;
    } catch {
      return -1;
    }
  },

  /**
   * Clear an interval safely
   */
  clearInterval(intervalId: number): void {
    try {
      if (!this.isClient() || intervalId < 0) return;
      window.clearInterval?.(intervalId);
    } catch {
      // Silently fail
    }
  },

  /**
   * Add an event listener safely
   */
  addEventListener<K extends keyof WindowEventMap>(
    event: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    try {
      if (!this.isClient()) return;
      window.addEventListener(event, handler as EventListener, options);
    } catch {
      // Silently fail
    }
  },

  /**
   * Remove an event listener safely
   */
  removeEventListener<K extends keyof WindowEventMap>(
    event: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: boolean | EventListenerOptions
  ): void {
    try {
      if (!this.isClient()) return;
      window.removeEventListener(event, handler as EventListener, options);
    } catch {
      // Silently fail
    }
  },

  /**
   * Get the performance API time safely
   */
  getPerformanceTime(): number {
    try {
      if (!this.isClient() || !window.performance?.now) return Date.now();
      return window.performance.now();
    } catch {
      return Date.now();
    }
  },

  /**
   * Modify document element class list safely
   */
  setDocumentClass(className: string, value: boolean): void {
    try {
      if (!this.isClient() || !document.documentElement) return;
      if (value) {
        document.documentElement.classList?.add(className);
      } else {
        document.documentElement.classList?.remove(className);
      }
    } catch {
      // Silently fail
    }
  },

  /**
   * Get an element by ID safely
   */
  getElementById(id: string): HTMLElement | null {
    try {
      if (!this.isClient()) return null;
      return document.getElementById(id);
    } catch {
      return null;
    }
  },

  /**
   * Show a confirmation dialog safely
   */
  confirm(message: string): boolean {
    try {
      if (!this.isClient()) return false;
      return window.confirm?.(message) ?? false;
    } catch {
      return false;
    }
  },

  /**
   * Create a URL object safely
   */
  createUrl(url: string): URL | null {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }
};
