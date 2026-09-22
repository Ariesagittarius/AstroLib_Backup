import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sidebarLayoutController, SIDEBAR_LEFT_STORAGE_KEY } from '../../src/components/sidebar/sidebar-layout-controller';
import { sideloadManager, SIDEBAR_RIGHT_STORAGE_KEY } from '../../src/components/sideload/sideload-manager';

describe('AstroLib 左右侧栏顶栏收纳架构与状态机测试', () => {
  let store: Map<string, string>;
  let docDataset: Record<string, string>;
  let docStyles: Record<string, string>;
  let bodyAttrs: Set<string>;

  beforeEach(() => {
    store = new Map<string, string>();
    docDataset = {
      sidebarLeftCollapsed: 'false',
      sidebarRightCollapsed: 'false',
    };
    docStyles = {};
    bodyAttrs = new Set<string>();

    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    };

    (globalThis as any).document = {
      documentElement: {
        dataset: docDataset,
        style: {
          setProperty: (k: string, v: string) => { docStyles[k] = v; },
          getPropertyValue: (k: string) => docStyles[k] ?? '',
        },
      },
      body: {
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn(),
        },
        hasAttribute: (attr: string) => bodyAttrs.has(attr),
        toggleAttribute: (attr: string, force?: boolean) => {
          const next = force !== undefined ? force : !bodyAttrs.has(attr);
          if (next) bodyAttrs.add(attr);
          else bodyAttrs.delete(attr);
          return next;
        },
        setAttribute: (attr: string, _val: string) => bodyAttrs.add(attr),
        removeAttribute: (attr: string) => bodyAttrs.delete(attr),
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null,
    };

    (globalThis as any).window = {
      matchMedia: (query: string) => ({
        matches: query.includes('min-width: 72rem'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    (globalThis as any).CustomEvent = class CustomEvent {
      type: string;
      detail: any;
      constructor(type: string, opts?: any) {
        this.type = type;
        this.detail = opts?.detail;
      }
    };
  });

  afterEach(() => {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).document;
    delete (globalThis as any).window;
    delete (globalThis as any).CustomEvent;
    vi.restoreAllMocks();
  });

  describe('1. 左侧栏控制器 (SidebarLayoutController)', () => {
    it('初态未折叠，且能够读取并同步状态', () => {
      sidebarLayoutController.setCollapsed(false);
      expect(sidebarLayoutController.isCollapsed()).toBe(false);
      expect((globalThis as any).document.documentElement.dataset.sidebarLeftCollapsed).toBe('false');
    });

    it('setCollapsed(true) 能够切换折叠状态并写入 localStorage', () => {
      sidebarLayoutController.setCollapsed(true);
      expect(sidebarLayoutController.isCollapsed()).toBe(true);
      expect(store.get(SIDEBAR_LEFT_STORAGE_KEY)).toBe('true');
      expect((globalThis as any).document.documentElement.dataset.sidebarLeftCollapsed).toBe('true');
    });

    it('toggleLeftSidebar 在桌面端时可在折叠与展开之间交替切换', () => {
      vi.spyOn(sidebarLayoutController, 'isMobileViewport').mockReturnValue(false);

      sidebarLayoutController.setCollapsed(false);
      expect(sidebarLayoutController.isCollapsed()).toBe(false);

      sidebarLayoutController.toggleLeftSidebar();
      expect(sidebarLayoutController.isCollapsed()).toBe(true);
      expect((globalThis as any).document.documentElement.dataset.sidebarLeftCollapsed).toBe('true');

      sidebarLayoutController.toggleLeftSidebar();
      expect(sidebarLayoutController.isCollapsed()).toBe(false);
      expect((globalThis as any).document.documentElement.dataset.sidebarLeftCollapsed).toBe('false');
    });

    it('toggleLeftSidebar 在移动端时切换 body[data-mobile-menu-expanded]', () => {
      vi.spyOn(sidebarLayoutController, 'isMobileViewport').mockReturnValue(true);

      const doc = (globalThis as any).document;
      expect(doc.body.hasAttribute('data-mobile-menu-expanded')).toBe(false);

      sidebarLayoutController.toggleLeftSidebar();
      expect(doc.body.hasAttribute('data-mobile-menu-expanded')).toBe(true);

      sidebarLayoutController.toggleLeftSidebar();
      expect(doc.body.hasAttribute('data-mobile-menu-expanded')).toBe(false);
    });

    it('状态变更时正确通知订阅者 listener 并派发 CustomEvent', () => {
      let notifiedState: any = null;
      const unsubscribe = sidebarLayoutController.subscribe((state) => {
        notifiedState = state;
      });

      sidebarLayoutController.setCollapsed(true);
      expect(notifiedState).not.toBeNull();
      expect(notifiedState.collapsed).toBe(true);

      unsubscribe();
    });
  });

  describe('2. 右侧栏管理器 (SideloadManager) 收放扩展', () => {
    beforeEach(() => {
      sideloadManager.switchToDefault();
    });

    it('初始默认激活本节大纲 (toc)，处于未折叠态', () => {
      expect(sideloadManager.isCollapsed()).toBe(false);
      expect(sideloadManager.getState().activePanelId).toBe('toc');
    });

    it('调用 collapse() 时，状态变更为 none 且注入 0rem 宽度与持久化标记', () => {
      sideloadManager.collapse();
      expect(sideloadManager.isCollapsed()).toBe(true);
      expect(sideloadManager.getState().activePanelId).toBe('none');
      expect(sideloadManager.getState().widthTier).toBe('none');
      expect(docDataset.sideloadActive).toBe('none');
      expect(docDataset.sidebarRightCollapsed).toBe('true');
      expect(docStyles['--sl-sideload-width']).toBe('0rem');
      expect(store.get(SIDEBAR_RIGHT_STORAGE_KEY)).toBe('true');
    });

    it('调用 restore() 或 toggleRightSidebar() 可从折叠态恢复为大纲', () => {
      sideloadManager.collapse();
      expect(sideloadManager.isCollapsed()).toBe(true);

      sideloadManager.restore();
      expect(sideloadManager.isCollapsed()).toBe(false);
      expect(sideloadManager.getState().activePanelId).toBe('toc');
      expect(docDataset.sidebarRightCollapsed).toBe('false');
      expect(store.get(SIDEBAR_RIGHT_STORAGE_KEY)).toBe('false');
    });

    it('若在习题面板激活时折叠，restore() 应能记住并精准恢复至习题面板', () => {
      sideloadManager.open('exercises');
      expect(sideloadManager.getState().activePanelId).toBe('exercises');

      sideloadManager.collapse();
      expect(sideloadManager.isCollapsed()).toBe(true);
      expect(sideloadManager.getPreviousPanelId()).toBe('exercises');

      sideloadManager.restore();
      expect(sideloadManager.getState().activePanelId).toBe('exercises');
    });

    it('toggleRightSidebar() 可在展开与折叠之间优雅交替', () => {
      sideloadManager.switchToDefault();
      expect(sideloadManager.isCollapsed()).toBe(false);

      sideloadManager.toggleRightSidebar();
      expect(sideloadManager.isCollapsed()).toBe(true);

      sideloadManager.toggleRightSidebar();
      expect(sideloadManager.isCollapsed()).toBe(false);
      expect(sideloadManager.getState().activePanelId).toBe('toc');
    });
  });

  describe('3. 纯享全屏阅读态 (Zen Reading Mode) 协同验证', () => {
    it('当左右侧栏同时收起时，两栏 dataset 与宽度协同归零', () => {
      sidebarLayoutController.setCollapsed(true);
      sideloadManager.collapse();

      expect(docDataset.sidebarLeftCollapsed).toBe('true');
      expect(docDataset.sidebarRightCollapsed).toBe('true');
      expect(docDataset.sideloadActive).toBe('none');
      expect(docStyles['--sl-sideload-width']).toBe('0rem');
      expect(store.get(SIDEBAR_LEFT_STORAGE_KEY)).toBe('true');
      expect(store.get(SIDEBAR_RIGHT_STORAGE_KEY)).toBe('true');
    });
  });
});
