import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import useTemaStore from '../stores/useTemaStore.js';
import { TEMAS_PADRAO } from '../core/temas.js';

// ==========================================
// Mock setup for localStorage and DOM
// ==========================================
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }
  };
})();

// Replace global localStorage
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
});

// Mock document.documentElement for CSS operations
const documentElementMock = {
  style: {
    setProperty: vi.fn()
  }
};

Object.defineProperty(global, 'document', {
  value: {
    documentElement: documentElementMock
  },
  writable: true
});

// ==========================================
// Helper functions
// ==========================================
function resetStoreState() {
  // Clear localStorage
  localStorage.clear();
  // Reset store to initial state by getting and manually resetting
  const state = useTemaStore.getState();
  useTemaStore.setState({
    temaAtivo: 'neon-ciano',
    temasCustom: {}
  });
}

// ==========================================
// useTemaStore tests
// ==========================================
describe('useTemaStore', () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  describe('Initial state', () => {
    it('initializes with temaAtivo from localStorage or default', () => {
      resetStoreState();
      const state = useTemaStore.getState();
      expect(state.temaAtivo).toBeDefined();
      expect(typeof state.temaAtivo).toBe('string');
    });

    it('initializes with empty temasCustom object', () => {
      const state = useTemaStore.getState();
      expect(state.temasCustom).toEqual({});
      expect(typeof state.temasCustom).toBe('object');
    });

    it('has getTodosOsTemas method', () => {
      const state = useTemaStore.getState();
      expect(typeof state.getTodosOsTemas).toBe('function');
    });

    it('has setTema method', () => {
      const state = useTemaStore.getState();
      expect(typeof state.setTema).toBe('function');
    });

    it('has salvarTemaCustom method', () => {
      const state = useTemaStore.getState();
      expect(typeof state.salvarTemaCustom).toBe('function');
    });

    it('has removerTemaCustom method', () => {
      const state = useTemaStore.getState();
      expect(typeof state.removerTemaCustom).toBe('function');
    });

    it('has obterTema method', () => {
      const state = useTemaStore.getState();
      expect(typeof state.obterTema).toBe('function');
    });

    it('has iniciarTema method', () => {
      const state = useTemaStore.getState();
      expect(typeof state.iniciarTema).toBe('function');
    });

    it('has setTemasCustom method', () => {
      const state = useTemaStore.getState();
      expect(typeof state.setTemasCustom).toBe('function');
    });
  });

  describe('getTodosOsTemas', () => {
    it('returns all default themes when no custom themes', () => {
      const todos = useTemaStore.getState().getTodosOsTemas();

      expect(todos).toEqual(TEMAS_PADRAO);
      Object.keys(TEMAS_PADRAO).forEach(id => {
        expect(todos).toHaveProperty(id);
      });
    });

    it('returns default themes + custom themes merged', () => {
      const store = useTemaStore.getState();
      store.salvarTemaCustom('meu-tema', 'Meu Tema', '🎨', {
        '--cor-primaria': '#fff',
        '--cor-primaria-rgb': '255, 255, 255'
      });

      const todos = store.getTodosOsTemas();

      // Should have all default themes
      expect(todos['neon-ciano']).toBeDefined();
      expect(todos['sangue-crimsono']).toBeDefined();
      // Plus the custom theme
      expect(todos['meu-tema']).toBeDefined();
      expect(todos['meu-tema'].nome).toBe('Meu Tema');
    });

    it('custom themes override default themes with same ID', () => {
      const store = useTemaStore.getState();
      store.salvarTemaCustom('neon-ciano', 'Custom Neon', '🟢', {
        '--cor-primaria': '#0f0'
      });

      const todos = store.getTodosOsTemas();
      expect(todos['neon-ciano'].nome).toBe('Custom Neon');
      expect(todos['neon-ciano'].emoji).toBe('🟢');
    });

    it('returns object type', () => {
      const todos = useTemaStore.getState().getTodosOsTemas();
      expect(typeof todos).toBe('object');
      expect(Array.isArray(todos)).toBe(false);
    });

    it('does not modify TEMAS_PADRAO', () => {
      const store = useTemaStore.getState();
      store.salvarTemaCustom('novo-tema', 'Novo', '🎯', {});

      const todos = store.getTodosOsTemas();
      // TEMAS_PADRAO should still have 6 themes
      expect(Object.keys(TEMAS_PADRAO)).toHaveLength(6);
    });
  });

  describe('setTema', () => {
    it('sets temaAtivo to valid theme ID', () => {
      useTemaStore.getState().setTema('sangue-crimsono');
      expect(useTemaStore.getState().temaAtivo).toBe('sangue-crimsono');
    });

    it('applies CSS variables for valid theme', () => {
      useTemaStore.getState().setTema('neon-ciano');
      expect(documentElementMock.style.setProperty).toHaveBeenCalled();
    });

    it('saves theme to localStorage when successful', () => {
      useTemaStore.getState().setTema('verde-mata');
      expect(localStorage.getItem('rpgTema')).toBe('verde-mata');
    });

    it('warns when theme ID is not found', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      useTemaStore.getState().setTema('tema-inexistente');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Tema não encontrado'));
      warnSpy.mockRestore();
    });

    it('does not change temaAtivo for invalid theme', () => {
      useTemaStore.getState().setTema('neon-ciano');
      const before = useTemaStore.getState().temaAtivo;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      useTemaStore.getState().setTema('tema-invalido');
      warnSpy.mockRestore();

      expect(useTemaStore.getState().temaAtivo).toBe(before);
    });

    it('works with custom themes', () => {
      const store = useTemaStore.getState();
      store.salvarTemaCustom('custom-theme', 'Custom', '🎨', {
        '--cor-primaria': '#fff'
      });

      store.setTema('custom-theme');
      expect(useTemaStore.getState().temaAtivo).toBe('custom-theme');
    });

    it('applies all CSS variables from theme', () => {
      vi.clearAllMocks();
      useTemaStore.getState().setTema('neon-ciano');

      const tema = TEMAS_PADRAO['neon-ciano'];
      const expectedCalls = Object.keys(tema.vars).length;
      expect(documentElementMock.style.setProperty).toHaveBeenCalledTimes(expectedCalls);
    });

    it('applies correct CSS variable values', () => {
      vi.clearAllMocks();
      useTemaStore.getState().setTema('neon-ciano');

      const tema = TEMAS_PADRAO['neon-ciano'];
      Object.entries(tema.vars).forEach(([key, value]) => {
        expect(documentElementMock.style.setProperty).toHaveBeenCalledWith(key, value);
      });
    });

    it('handles localStorage save errors gracefully', () => {
      const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('Storage full');
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      useTemaStore.getState().setTema('neon-ciano');

      // O código atual loga a mensagem + o erro original como 2º argumento
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Erro ao salvar tema'), expect.any(Error));
      setItemSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('can switch between multiple themes', () => {
      const store = useTemaStore.getState();

      store.setTema('neon-ciano');
      expect(useTemaStore.getState().temaAtivo).toBe('neon-ciano');

      store.setTema('sangue-crimsono');
      expect(useTemaStore.getState().temaAtivo).toBe('sangue-crimsono');

      store.setTema('verde-mata');
      expect(useTemaStore.getState().temaAtivo).toBe('verde-mata');
    });
  });

  describe('salvarTemaCustom', () => {
    it('adds custom theme to temasCustom', () => {
      useTemaStore.getState().salvarTemaCustom('my-theme', 'My Theme', '🎭', {
        '--cor-primaria': '#ff0000'
      });

      const state = useTemaStore.getState();
      expect(state.temasCustom['my-theme']).toBeDefined();
    });

    it('sets theme properties correctly', () => {
      useTemaStore.getState().salvarTemaCustom('my-theme', 'My Theme', '🎭', {
        '--cor-primaria': '#ff0000'
      });

      const tema = useTemaStore.getState().temasCustom['my-theme'];
      expect(tema.id).toBe('my-theme');
      expect(tema.nome).toBe('My Theme');
      expect(tema.emoji).toBe('🎭');
      expect(tema.vars['--cor-primaria']).toBe('#ff0000');
    });

    it('sets custom flag to true', () => {
      useTemaStore.getState().salvarTemaCustom('my-theme', 'My Theme', '🎭', {});
      const tema = useTemaStore.getState().temasCustom['my-theme'];
      expect(tema.custom).toBe(true);
    });

    it('sets description to default text', () => {
      useTemaStore.getState().salvarTemaCustom('my-theme', 'My Theme', '🎭', {});
      const tema = useTemaStore.getState().temasCustom['my-theme'];
      expect(tema.descricao).toBe('Tema custom criado');
    });

    it('sets dataCriacao to ISO string', () => {
      useTemaStore.getState().salvarTemaCustom('my-theme', 'My Theme', '🎭', {});
      const tema = useTemaStore.getState().temasCustom['my-theme'];
      expect(typeof tema.dataCriacao).toBe('string');
      expect(tema.dataCriacao).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('can save multiple custom themes', () => {
      const store = useTemaStore.getState();

      store.salvarTemaCustom('tema1', 'Tema Um', '1️⃣', {});
      store.salvarTemaCustom('tema2', 'Tema Dois', '2️⃣', {});
      store.salvarTemaCustom('tema3', 'Tema Três', '3️⃣', {});

      expect(Object.keys(useTemaStore.getState().temasCustom)).toHaveLength(3);
      expect(useTemaStore.getState().temasCustom['tema1']).toBeDefined();
      expect(useTemaStore.getState().temasCustom['tema2']).toBeDefined();
      expect(useTemaStore.getState().temasCustom['tema3']).toBeDefined();
    });

    it('overwrites custom theme with same ID', () => {
      const store = useTemaStore.getState();

      store.salvarTemaCustom('my-theme', 'Version 1', '🎨', {
        '--cor-primaria': '#ff0000'
      });

      store.salvarTemaCustom('my-theme', 'Version 2', '🎯', {
        '--cor-primaria': '#00ff00'
      });

      const tema = useTemaStore.getState().temasCustom['my-theme'];
      expect(tema.nome).toBe('Version 2');
      expect(tema.emoji).toBe('🎯');
      expect(tema.vars['--cor-primaria']).toBe('#00ff00');
    });

    it('accepts null vars and uses default', () => {
      // O ambiente é jsdom (window existe) mas document está trocado por um mock sem Element real,
      // então window.getComputedStyle é stubado para devolver as variáveis "atuais" do CSS.
      const csSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        getPropertyValue: (k) => (k === '--cor-primaria' ? ' #123456 ' : '')
      });
      useTemaStore.getState().salvarTemaCustom('my-theme', 'My Theme', '🎨', null);
      csSpy.mockRestore();
      const tema = useTemaStore.getState().temasCustom['my-theme'];
      expect(tema.vars).toBeDefined();
      expect(typeof tema.vars).toBe('object');
      // vars nulo => usa as variáveis CSS atualmente aplicadas (com trim)
      expect(tema.vars).toEqual({ '--cor-primaria': '#123456' });
    });

    it('stores provided vars object', () => {
      const customVars = {
        '--cor-primaria': '#ff0000',
        '--cor-secundaria': '#00ff00',
        '--custom-var': 'custom-value'
      };

      useTemaStore.getState().salvarTemaCustom('my-theme', 'My Theme', '🎨', customVars);

      const tema = useTemaStore.getState().temasCustom['my-theme'];
      expect(tema.vars).toEqual(customVars);
    });
  });

  describe('removerTemaCustom', () => {
    it('removes custom theme from temasCustom', () => {
      const store = useTemaStore.getState();

      store.salvarTemaCustom('to-remove', 'To Remove', '🗑️', {});
      expect(useTemaStore.getState().temasCustom['to-remove']).toBeDefined();

      store.removerTemaCustom('to-remove');
      expect(useTemaStore.getState().temasCustom['to-remove']).toBeUndefined();
    });

    it('does nothing when removing non-existent theme', () => {
      const store = useTemaStore.getState();
      const before = Object.keys(useTemaStore.getState().temasCustom).length;

      store.removerTemaCustom('non-existent');
      const after = Object.keys(useTemaStore.getState().temasCustom).length;

      expect(before).toBe(after);
    });

    it('can remove multiple custom themes', () => {
      const store = useTemaStore.getState();

      store.salvarTemaCustom('tema1', 'Tema Um', '1️⃣', {});
      store.salvarTemaCustom('tema2', 'Tema Dois', '2️⃣', {});
      store.salvarTemaCustom('tema3', 'Tema Três', '3️⃣', {});

      expect(useTemaStore.getState().temasCustom).toHaveProperty('tema1');
      expect(useTemaStore.getState().temasCustom).toHaveProperty('tema2');
      expect(useTemaStore.getState().temasCustom).toHaveProperty('tema3');

      store.removerTemaCustom('tema1');
      store.removerTemaCustom('tema3');

      expect(useTemaStore.getState().temasCustom).not.toHaveProperty('tema1');
      expect(useTemaStore.getState().temasCustom).toHaveProperty('tema2');
      expect(useTemaStore.getState().temasCustom).not.toHaveProperty('tema3');
    });

    it('does not affect default themes', () => {
      const store = useTemaStore.getState();

      store.salvarTemaCustom('neon-ciano-custom', 'Custom Neon', '🔵', {});
      store.removerTemaCustom('neon-ciano-custom');

      // Default neon-ciano should still be available
      const todos = store.getTodosOsTemas();
      expect(todos['neon-ciano']).toBeDefined();
      expect(todos['neon-ciano'].nome).toBe('Neon Ciano');
    });
  });

  describe('obterTema', () => {
    it('returns default theme by ID', () => {
      const tema = useTemaStore.getState().obterTema('neon-ciano');
      expect(tema).not.toBeNull();
      expect(tema.id).toBe('neon-ciano');
      expect(tema.nome).toBe('Neon Ciano');
    });

    it('returns custom theme by ID', () => {
      const store = useTemaStore.getState();
      store.salvarTemaCustom('my-tema', 'My Tema', '🎯', { '--cor-primaria': '#fff' });

      const tema = store.obterTema('my-tema');
      expect(tema).not.toBeNull();
      expect(tema.id).toBe('my-tema');
      expect(tema.nome).toBe('My Tema');
    });

    it('returns null for non-existent theme', () => {
      const tema = useTemaStore.getState().obterTema('inexistente');
      expect(tema).toBeNull();
    });

    it('returns null for invalid ID', () => {
      expect(useTemaStore.getState().obterTema(null)).toBeNull();
      expect(useTemaStore.getState().obterTema(undefined)).toBeNull();
      expect(useTemaStore.getState().obterTema('')).toBeNull();
    });

    it('prefers custom themes over default when ID matches', () => {
      const store = useTemaStore.getState();

      // Override default theme
      store.salvarTemaCustom('neon-ciano', 'Custom Neon', '🟢', {
        '--cor-primaria': '#0f0'
      });

      const tema = store.obterTema('neon-ciano');
      expect(tema.emoji).toBe('🟢');
      expect(tema.nome).toBe('Custom Neon');
    });

    it('returns complete theme object', () => {
      const tema = useTemaStore.getState().obterTema('neon-ciano');
      expect(tema).toHaveProperty('id');
      expect(tema).toHaveProperty('nome');
      expect(tema).toHaveProperty('emoji');
      expect(tema).toHaveProperty('descricao');
      expect(tema).toHaveProperty('vars');
    });
  });

  describe('setTemasCustom', () => {
    it('replaces temasCustom with provided object', () => {
      const store = useTemaStore.getState();

      const customTemas = {
        'tema-novo': {
          id: 'tema-novo',
          nome: 'Tema Novo',
          emoji: '🆕',
          descricao: 'Novo tema',
          vars: { '--cor-primaria': '#fff' }
        }
      };

      store.setTemasCustom(customTemas);
      expect(useTemaStore.getState().temasCustom).toEqual(customTemas);
    });

    it('clears temasCustom when passed empty object', () => {
      const store = useTemaStore.getState();

      store.salvarTemaCustom('tema1', 'Tema Um', '1️⃣', {});
      expect(useTemaStore.getState().temasCustom).toHaveProperty('tema1');

      store.setTemasCustom({});
      expect(useTemaStore.getState().temasCustom).toEqual({});
    });

    it('sets to empty object when passed null', () => {
      const store = useTemaStore.getState();
      store.salvarTemaCustom('tema1', 'Tema Um', '1️⃣', {});

      store.setTemasCustom(null);
      expect(useTemaStore.getState().temasCustom).toEqual({});
    });

    it('sets to empty object when passed undefined', () => {
      const store = useTemaStore.getState();
      store.salvarTemaCustom('tema1', 'Tema Um', '1️⃣', {});

      store.setTemasCustom(undefined);
      expect(useTemaStore.getState().temasCustom).toEqual({});
    });

    it('replaces all existing custom themes', () => {
      const store = useTemaStore.getState();

      store.salvarTemaCustom('tema1', 'Tema Um', '1️⃣', {});
      store.salvarTemaCustom('tema2', 'Tema Dois', '2️⃣', {});

      const newTemas = {
        'novo-tema': {
          id: 'novo-tema',
          nome: 'Novo Tema',
          emoji: '🆕',
          vars: {}
        }
      };

      store.setTemasCustom(newTemas);

      expect(useTemaStore.getState().temasCustom).not.toHaveProperty('tema1');
      expect(useTemaStore.getState().temasCustom).not.toHaveProperty('tema2');
      expect(useTemaStore.getState().temasCustom).toHaveProperty('novo-tema');
    });

    it('allows getTodosOsTemas to include new custom themes', () => {
      const store = useTemaStore.getState();

      const customTemas = {
        'custom-1': {
          id: 'custom-1',
          nome: 'Custom 1',
          emoji: '🎨',
          vars: { '--cor-primaria': '#fff' }
        },
        'custom-2': {
          id: 'custom-2',
          nome: 'Custom 2',
          emoji: '🎭',
          vars: { '--cor-primaria': '#000' }
        }
      };

      store.setTemasCustom(customTemas);
      const todos = store.getTodosOsTemas();

      expect(todos['custom-1']).toBeDefined();
      expect(todos['custom-2']).toBeDefined();
      expect(todos['neon-ciano']).toBeDefined(); // Default still present
    });
  });

  describe('iniciarTema', () => {
    it('loads theme from localStorage when available', () => {
      localStorage.setItem('rpgTema', 'sangue-crimsono');
      vi.clearAllMocks();

      useTemaStore.getState().iniciarTema();

      expect(useTemaStore.getState().temaAtivo).toBe('sangue-crimsono');
    });

    it('applies CSS variables for loaded theme', () => {
      localStorage.setItem('rpgTema', 'verde-mata');
      vi.clearAllMocks();

      useTemaStore.getState().iniciarTema();

      expect(documentElementMock.style.setProperty).toHaveBeenCalled();
    });

    it('defaults to neon-ciano when localStorage empty', () => {
      localStorage.clear();
      useTemaStore.getState().iniciarTema();

      expect(useTemaStore.getState().temaAtivo).toBe('neon-ciano');
    });

    it('falls back to neon-ciano when stored theme not found', () => {
      localStorage.setItem('rpgTema', 'tema-deletado');
      useTemaStore.getState().iniciarTema();

      expect(useTemaStore.getState().temaAtivo).toBe('neon-ciano');
    });

    it('applies default theme CSS when fallback', () => {
      localStorage.setItem('rpgTema', 'tema-inexistente');
      vi.clearAllMocks();

      useTemaStore.getState().iniciarTema();

      expect(documentElementMock.style.setProperty).toHaveBeenCalled();
      // Should apply neon-ciano vars
      const tema = TEMAS_PADRAO['neon-ciano'];
      Object.entries(tema.vars).forEach(([key, value]) => {
        expect(documentElementMock.style.setProperty).toHaveBeenCalledWith(key, value);
      });
    });

    it('loads custom theme from store when available', () => {
      const store = useTemaStore.getState();
      store.salvarTemaCustom('my-custom', 'My Custom', '🎨', {
        '--cor-primaria': '#fff'
      });

      localStorage.setItem('rpgTema', 'my-custom');
      store.iniciarTema();

      expect(useTemaStore.getState().temaAtivo).toBe('my-custom');
    });

    it('updates temaAtivo state', () => {
      localStorage.setItem('rpgTema', 'ouro-imperial');

      useTemaStore.getState().iniciarTema();
      expect(useTemaStore.getState().temaAtivo).toBe('ouro-imperial');
    });

    it('can be called multiple times safely', () => {
      localStorage.setItem('rpgTema', 'nexo-violeta');
      const store = useTemaStore.getState();

      store.iniciarTema();
      expect(useTemaStore.getState().temaAtivo).toBe('nexo-violeta');

      store.iniciarTema();
      expect(useTemaStore.getState().temaAtivo).toBe('nexo-violeta');

      store.iniciarTema();
      expect(useTemaStore.getState().temaAtivo).toBe('nexo-violeta');
    });
  });

  describe('Integration tests', () => {
    it('complete workflow: save, set, and retrieve custom theme', () => {
      const store = useTemaStore.getState();

      // Save custom theme
      store.salvarTemaCustom('workflow-theme', 'Workflow Theme', '🔄', {
        '--cor-primaria': '#ff00ff'
      });

      // Set it as active
      store.setTema('workflow-theme');
      expect(useTemaStore.getState().temaAtivo).toBe('workflow-theme');

      // Retrieve it
      const tema = store.obterTema('workflow-theme');
      expect(tema.nome).toBe('Workflow Theme');
      expect(tema.emoji).toBe('🔄');

      // Verify it's in todos
      const todos = store.getTodosOsTemas();
      expect(todos['workflow-theme']).toBeDefined();
    });

    it('can switch between default and custom themes', () => {
      const store = useTemaStore.getState();

      store.setTema('neon-ciano');
      expect(useTemaStore.getState().temaAtivo).toBe('neon-ciano');

      store.salvarTemaCustom('custom-1', 'Custom 1', '🎨', {});
      store.setTema('custom-1');
      expect(useTemaStore.getState().temaAtivo).toBe('custom-1');

      store.setTema('sangue-crimsono');
      expect(useTemaStore.getState().temaAtivo).toBe('sangue-crimsono');

      store.setTema('custom-1');
      expect(useTemaStore.getState().temaAtivo).toBe('custom-1');
    });

    it('handles persistence workflow', () => {
      localStorage.clear();
      const store = useTemaStore.getState();

      // Set theme (saves to localStorage)
      store.setTema('verde-mata');
      expect(localStorage.getItem('rpgTema')).toBe('verde-mata');

      // Simulate app reload by initializing
      store.iniciarTema();
      expect(useTemaStore.getState().temaAtivo).toBe('verde-mata');
    });

    it('getTodosOsTemas includes all themes after various operations', () => {
      const store = useTemaStore.getState();

      // Add custom themes
      store.salvarTemaCustom('custom-1', 'Custom 1', '1️⃣', {});
      store.salvarTemaCustom('custom-2', 'Custom 2', '2️⃣', {});

      // Get all
      const todos = store.getTodosOsTemas();

      // Should have all default themes
      const defaultCount = Object.keys(TEMAS_PADRAO).length;
      expect(Object.keys(todos).length).toBe(defaultCount + 2);

      // Verify both default and custom are present
      expect(todos['neon-ciano']).toBeDefined();
      expect(todos['custom-1']).toBeDefined();
      expect(todos['custom-2']).toBeDefined();
    });

    it('loading custom themes from Firebase via setTemasCustom', () => {
      const store = useTemaStore.getState();

      const firebaseThemes = {
        'firebase-theme-1': {
          id: 'firebase-theme-1',
          nome: 'Firebase Theme 1',
          emoji: '🔥',
          vars: { '--cor-primaria': '#ff0000' },
          custom: true,
          dataCriacao: '2024-01-01T00:00:00.000Z'
        },
        'firebase-theme-2': {
          id: 'firebase-theme-2',
          nome: 'Firebase Theme 2',
          emoji: '⚡',
          vars: { '--cor-primaria': '#ffff00' },
          custom: true,
          dataCriacao: '2024-01-02T00:00:00.000Z'
        }
      };

      // Simulate loading from Firebase
      store.setTemasCustom(firebaseThemes);

      // Verify themes are available
      const tema1 = store.obterTema('firebase-theme-1');
      expect(tema1.nome).toBe('Firebase Theme 1');

      const todos = store.getTodosOsTemas();
      expect(todos['firebase-theme-1']).toBeDefined();
      expect(todos['firebase-theme-2']).toBeDefined();

      // Can set one as active
      store.setTema('firebase-theme-1');
      expect(useTemaStore.getState().temaAtivo).toBe('firebase-theme-1');
    });
  });
});
