// Mock browser APIs for testing
global.browser = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    sendMessage: vi.fn(),
  },
  runtime: {
    getManifest: vi.fn(() => ({ manifest_version: 3 })),
  },
  permissions: {
    getAll: vi.fn(),
    request: vi.fn(),
  },
};
